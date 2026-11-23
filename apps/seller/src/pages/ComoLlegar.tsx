import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { loadGoogleMaps } from '@aviva/ui';
import type { Prospecto } from '../api';
import { useSession } from '../session';
import { useUbicacion } from '../ubicacion';
import { rutaEnCache } from '../offline';
import { comoLlegarUrl, distanciaMetros, textoDistancia, type Posicion } from '../ruta';
import { IconAtras, IconCheck, IconPin } from '../icons';

type Modo = 'WALKING' | 'DRIVING';

// A partir de esta distancia se le dice que ya llegó (la misma con la que el
// admin cuenta una visita como "hecha en el negocio").
const LLEGASTE_M = 50;
// La ruta se vuelve a trazar si se alejó de donde se calculó la última
// (tomó otra calle), sin pedirla más de una vez cada tanto.
const RECALCULAR_SI_SE_MUEVE_M = 80;
const RECALCULAR_CADA_MS = 20_000;

// "Cómo llegar" sin salir de la app: el mapa con la ruta por calles desde
// donde está el vendedor hasta el negocio, y "Registrar visita" a la mano
// cuando llega. Su posición se sigue en vivo mientras la pantalla está abierta.
export function ComoLlegar() {
  const { vendedor } = useSession();
  const { id } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();
  const { posicion: posicionApp } = useUbicacion();

  const [prospecto] = useState<Prospecto | null>(() => (state as { prospecto?: Prospecto } | null)?.prospecto
    ?? (vendedor ? rutaEnCache(vendedor.id)?.find((p) => p.id === id) ?? null : null));
  const [pos, setPos] = useState<Posicion | null>(posicionApp);
  const [modo, setModo] = useState<Modo>('WALKING');
  const [ruta, setRuta] = useState<{ metros: number; segundos: number } | null>(null);
  const [sinRuta, setSinRuta] = useState(false);
  const [errorMapa, setErrorMapa] = useState('');
  const [listo, setListo] = useState(false);

  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<google.maps.Map | null>(null);
  const yo = useRef<google.maps.Marker | null>(null);
  const negocio = useRef<google.maps.Marker | null>(null);
  const trazo = useRef<google.maps.DirectionsRenderer | null>(null);
  const recta = useRef<google.maps.Polyline | null>(null);
  const ultimoCalculo = useRef<{ en: number; desde: Posicion; modo: Modo } | null>(null);
  const encuadrado = useRef(false);

  const destino = prospecto?.lat != null && prospecto?.lng != null ? { lat: prospecto.lat, lng: prospecto.lng } : null;

  // GPS en vivo (más seguido que el de toda la app) solo mientras se navega.
  useEffect(() => {
    if (!('geolocation' in navigator)) return;
    const w = navigator.geolocation.watchPosition(
      (p) => setPos({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(w);
  }, []);
  useEffect(() => { if (!pos && posicionApp) setPos(posicionApp); }, [posicionApp, pos]);

  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps().then((g) => {
      if (cancelado || !contenedor.current || mapa.current) return;
      mapa.current = new g.maps.Map(contenedor.current, {
        center: destino ?? pos ?? { lat: 20.6597, lng: -103.3496 }, zoom: 16, disableDefaultUI: true, zoomControl: true,
        clickableIcons: false, gestureHandling: 'greedy', tilt: 0,
      });
      setListo(true);
    }).catch(() => !cancelado && setErrorMapa('No se pudo cargar el mapa. Revisa tu señal.'));
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Marcadores: el negocio (naranja) y él (azul).
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    if (destino && !negocio.current) {
      negocio.current = new google.maps.Marker({
        map: m, position: destino, zIndex: 100, title: prospecto?.nombre,
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: '#e07a26', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      });
    }
    if (pos) {
      if (!yo.current) {
        yo.current = new google.maps.Marker({
          map: m, zIndex: 200, title: 'Tú estás aquí',
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#2a6fdb', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
        });
      }
      yo.current.setPosition(pos);
    }
  }, [listo, pos, destino?.lat, destino?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  // La ruta por calles. Si no se puede trazar (sin señal o el servicio de
  // rutas no está habilitado), se dibuja la línea recta al negocio.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || !pos || !prospecto) return;
    const u = ultimoCalculo.current;
    const seMovio = !u || distanciaMetros(u.desde, pos) > RECALCULAR_SI_SE_MUEVE_M;
    if (u && u.modo === modo && (!seMovio || Date.now() - u.en < RECALCULAR_CADA_MS)) return;
    ultimoCalculo.current = { en: Date.now(), desde: pos, modo };

    new google.maps.DirectionsService().route({
      origin: { lat: pos.lat, lng: pos.lng },
      destination: destino ?? prospecto.direccion,
      travelMode: google.maps.TravelMode[modo],
    }, (res, status) => {
      const leg = res?.routes[0]?.legs[0];
      if (status !== 'OK' || !res || !leg) {
        setSinRuta(true);
        setRuta(null);
        trazo.current?.setMap(null);
        if (destino) {
          recta.current?.setMap(null);
          recta.current = new google.maps.Polyline({
            map: m, path: [pos, destino], strokeOpacity: 0, zIndex: 50,
            icons: [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.9, strokeColor: '#2a6fdb', scale: 4 }, offset: '0', repeat: '16px' }],
          });
        }
      } else {
        setSinRuta(false);
        recta.current?.setMap(null);
        trazo.current ??= new google.maps.DirectionsRenderer({
          map: m, suppressMarkers: true, preserveViewport: true,
          polylineOptions: { strokeColor: '#2a6fdb', strokeOpacity: 0.9, strokeWeight: 7 },
        });
        trazo.current.setMap(m);
        trazo.current.setDirections(res);
        setRuta({ metros: leg.distance?.value ?? 0, segundos: leg.duration?.value ?? 0 });
        // Sin coordenadas del negocio, el destino es donde termina la ruta.
        if (!destino && !negocio.current) {
          negocio.current = new google.maps.Marker({
            map: m, position: leg.end_location, zIndex: 100,
            icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: '#e07a26', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
          });
        }
      }
      if (!encuadrado.current) {
        const b = new google.maps.LatLngBounds();
        b.extend(pos);
        if (destino) b.extend(destino);
        else if (leg) b.extend(leg.end_location);
        m.fitBounds(b, 70);
        encuadrado.current = true;
      }
    });
  }, [listo, pos, modo]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!prospecto) {
    return (
      <div style={{ padding: 28, textAlign: 'center' }}>
        <p style={{ fontSize: 16, color: '#6f7d75', fontWeight: 600 }}>No encontramos este negocio en tu ruta.</p>
        <button className="btn btn-primary tap" onClick={() => navigate('/')}>Volver a mi ruta</button>
      </div>
    );
  }

  const enLinea = pos && destino ? distanciaMetros(pos, destino) : null;
  const llegaste = enLinea != null && enLinea <= LLEGASTE_M;
  const minutos = ruta ? Math.max(1, Math.round(ruta.segundos / 60)) : null;
  // Si vino desde el registro de la visita, regresa a él (no abre otro).
  const desdeVisita = !!(state as { desdeVisita?: boolean } | null)?.desdeVisita;
  const registrar = () => (desdeVisita ? navigate(-1) : navigate(`/visita/${prospecto.id}`, { replace: true, state: { prospecto } }));
  const centrar = () => {
    const m = mapa.current;
    if (!m || !pos) return;
    const b = new google.maps.LatLngBounds();
    b.extend(pos);
    if (destino) b.extend(destino);
    m.fitBounds(b, 70);
  };

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 400 }}>
      {/* rr-block: el mapa no se graba en las sesiones (pesa mucho y no aporta). */}
      <div ref={contenedor} className="rr-block" style={{ position: 'absolute', inset: 0, background: '#e7ece4' }} />

      <div style={{ position: 'absolute', top: 12, left: 12, right: 12, display: 'flex', gap: 10, alignItems: 'center' }}>
        <button
          onClick={() => navigate(-1)} aria-label="Regresar" className="tap"
          style={{ width: 52, height: 52, borderRadius: 16, background: '#fff', boxShadow: '0 2px 8px rgba(0,0,0,.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}
        ><IconAtras size={26} stroke={2.6} /></button>
        <div style={{ flex: 1 }} />
        {listo && (
          <div style={{ display: 'flex', background: '#fff', borderRadius: 16, padding: 4, boxShadow: '0 2px 8px rgba(0,0,0,.15)' }}>
            {([['WALKING', 'A pie'], ['DRIVING', 'En auto']] as const).map(([m, l]) => (
              <button
                key={m} onClick={() => setModo(m)} className="tap"
                style={{ minHeight: 44, padding: '0 14px', borderRadius: 12, fontSize: 15, fontWeight: 800, background: modo === m ? 'var(--aviva-green-700)' : 'transparent', color: modo === m ? '#fff' : '#4f6157' }}
              >{l}</button>
            ))}
          </div>
        )}
      </div>

      {listo && pos && (
        <button
          onClick={centrar} className="chip tap"
          style={{ position: 'absolute', right: 12, top: 76, boxShadow: '0 2px 6px rgba(0,0,0,.12)', color: '#2a6fdb' }}
        ><IconPin size={18} /> Ver todo</button>
      )}

      <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, maxWidth: 560, margin: '0 auto' }}>
        <div className="card" style={{ padding: 18, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
          {llegaste ? (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: '#15703f', background: 'var(--aviva-green-100)', borderRadius: 12, padding: '5px 10px', marginBottom: 8 }}>
              <IconCheck size={16} stroke={3} /> Ya llegaste
            </div>
          ) : (
            <div style={{ fontSize: 15, fontWeight: 800, color: '#2a6fdb', marginBottom: 6 }}>
              {ruta ? `${textoDistancia(ruta.metros)} · ${minutos} min ${modo === 'WALKING' ? 'caminando' : 'en auto'}`
                : enLinea != null ? `A ${textoDistancia(enLinea)} en línea recta`
                  : pos ? 'Buscando la ruta…' : 'Buscando tu ubicación…'}
            </div>
          )}
          <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink-900)', lineHeight: 1.2 }}>{prospecto.nombre}</div>
          <div style={{ fontSize: 15, color: '#6f7d75', fontWeight: 500, marginTop: 4, lineHeight: 1.4 }}>
            {[prospecto.giro, prospecto.direccion].filter(Boolean).join(' · ')}
          </div>
          {sinRuta && listo && !llegaste && (
            <div style={{ fontSize: 13.5, color: '#8a5a1e', fontWeight: 600, marginTop: 8 }}>
              No pudimos trazar la ruta por calles: la línea punteada te marca la dirección del negocio.
            </div>
          )}
          {errorMapa && (
            <div style={{ fontSize: 14, color: '#8a5a1e', fontWeight: 600, marginTop: 10, lineHeight: 1.45 }}>
              {errorMapa}{' '}
              {/* Solo como último recurso, si el mapa de la app no carga. */}
              <a href={comoLlegarUrl(prospecto)} target="_blank" rel="noreferrer" style={{ color: 'var(--aviva-green-700)', fontWeight: 800 }}>Abrir en Google Maps</a>
            </div>
          )}
          <button className="btn btn-primary tap" onClick={registrar} style={{ width: '100%', marginTop: 14, minHeight: 58 }}>
            Registrar visita
          </button>
        </div>
      </div>
    </div>
  );
}

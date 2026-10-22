import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadGoogleMaps } from '@aviva/ui';
import { useSession } from '../session';
import { useUbicacion } from '../ubicacion';
import { prospectosConCache, rutaEnCache, useCambiosDeRuta } from '../offline';
import { agruparRuta, comoLlegarUrl, textoDistancia, type Parada } from '../ruta';
import { IconNavegar, IconPin, IconX } from '../icons';
import type { Prospecto } from '../api';

type Filtro = 'hoy' | 'todo';

// Mapa de la ruta: pensado para ubicarse en la calle ("¿cuál me queda más
// cerca?"). Se carga solo al abrir esta pestaña: Google Maps es lo más
// pesado de la app para una tablet de gama baja.
export function Mapa() {
  const { vendedor } = useSession();
  const { posicion } = useUbicacion();
  const navigate = useNavigate();
  const cambios = useCambiosDeRuta();
  const [lista, setLista] = useState<Prospecto[]>(() => (vendedor ? rutaEnCache(vendedor.id) ?? [] : []));
  const [filtro, setFiltro] = useState<Filtro>('hoy');
  const [seleccion, setSeleccion] = useState<Parada | null>(null);
  const [error, setError] = useState('');

  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<google.maps.Map | null>(null);
  const marcadores = useRef<google.maps.Marker[]>([]);
  const yo = useRef<google.maps.Marker | null>(null);
  const encuadrado = useRef(false);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    if (vendedor) prospectosConCache(vendedor.id).then(setLista).catch(() => {});
  }, [vendedor, cambios]);

  const ruta = useMemo(() => agruparRuta(lista, posicion), [lista, posicion]);
  const paradas = useMemo(() => {
    const hoy = [...ruta.hoy, ...ruta.sinFecha];
    return filtro === 'hoy' ? hoy : [...hoy, ...ruta.proximos.flatMap((d) => d.paradas)];
  }, [ruta, filtro]);

  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelado || !contenedor.current || mapa.current) return;
        mapa.current = new g.maps.Map(contenedor.current, {
          center: { lat: 20.6597, lng: -103.3496 }, zoom: 14, disableDefaultUI: true, zoomControl: true,
          clickableIcons: false, gestureHandling: 'greedy', tilt: 0,
        });
        setListo(true);
      })
      .catch(() => !cancelado && setError('No se pudo cargar el mapa. Revisa tu señal; mientras tanto usa la lista de "Mi ruta".'));
    return () => { cancelado = true; };
  }, []);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    marcadores.current.forEach((x) => x.setMap(null));
    const futuros = new Set(ruta.proximos.flatMap((d) => d.paradas.map((p) => p.id)));
    marcadores.current = paradas.filter((p) => p.lat != null && p.lng != null).map((p, i) => {
      const futuro = futuros.has(p.id);
      const marcador = new google.maps.Marker({
        map: m,
        position: { lat: p.lat!, lng: p.lng! },
        zIndex: futuro ? 1 : 100 - i,
        label: futuro ? undefined : { text: String(i + 1), color: '#fff', fontWeight: '800', fontSize: '13px' },
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: futuro ? 7 : 14,
          fillColor: futuro ? '#9aa39c' : p.atrasada ? '#c0392b' : '#e07a26', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2,
        },
      });
      marcador.addListener('click', () => setSeleccion(p));
      return marcador;
    });
    if (!encuadrado.current && (marcadores.current.length || posicion)) {
      const bounds = new google.maps.LatLngBounds();
      marcadores.current.forEach((x) => bounds.extend(x.getPosition()!));
      if (posicion) bounds.extend(posicion);
      m.fitBounds(bounds, 60);
      encuadrado.current = true;
    }
  }, [paradas, ruta, listo, posicion]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo || !posicion) return;
    if (!yo.current) {
      yo.current = new google.maps.Marker({
        map: m, zIndex: 200, title: 'Tú estás aquí',
        icon: { path: google.maps.SymbolPath.CIRCLE, scale: 9, fillColor: '#2a6fdb', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      });
    }
    yo.current.setPosition(posicion);
  }, [posicion, listo]);

  const centrarEnMi = () => {
    if (mapa.current && posicion) { mapa.current.panTo(posicion); mapa.current.setZoom(16); }
  };

  return (
    <div style={{ position: 'relative', height: '100%', minHeight: 400 }}>
      <div ref={contenedor} style={{ position: 'absolute', inset: 0, background: '#e7ece4' }} />
      {error && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 30, textAlign: 'center', fontSize: 16, fontWeight: 700, color: '#5a665f' }}>{error}</div>
      )}

      <div style={{ position: 'absolute', top: 14, left: 14, right: 14, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <button className="chip tap" aria-pressed={filtro === 'hoy'} onClick={() => setFiltro('hoy')} style={{ boxShadow: '0 2px 6px rgba(0,0,0,.12)' }}>
          Hoy · {ruta.hoy.length + ruta.sinFecha.length}
        </button>
        <button className="chip tap" aria-pressed={filtro === 'todo'} onClick={() => setFiltro('todo')} style={{ boxShadow: '0 2px 6px rgba(0,0,0,.12)' }}>
          Toda mi ruta
        </button>
        <span style={{ flex: 1 }} />
        {posicion && (
          <button className="chip tap" onClick={centrarEnMi} style={{ boxShadow: '0 2px 6px rgba(0,0,0,.12)', color: '#2a6fdb' }}>
            <IconPin size={18} /> Dónde estoy
          </button>
        )}
      </div>

      {seleccion && (
        <div className="aparecer" style={{ position: 'absolute', left: 12, right: 12, bottom: 12, maxWidth: 560, margin: '0 auto' }}>
          <div className="card" style={{ padding: 18, boxShadow: '0 8px 24px rgba(0,0,0,.18)' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--ink-900)' }}>{seleccion.nombre}</div>
                <div style={{ fontSize: 15, color: '#6f7d75', fontWeight: 500, marginTop: 4, lineHeight: 1.4 }}>
                  {[textoDistancia(seleccion.distanciaM) && `a ${textoDistancia(seleccion.distanciaM)}`, seleccion.giro, seleccion.direccion].filter(Boolean).join(' · ')}
                </div>
              </div>
              <button onClick={() => setSeleccion(null)} aria-label="Cerrar" className="tap" style={{ width: 44, height: 44, borderRadius: 12, background: '#eef5f0', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
                <IconX size={20} />
              </button>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
              <a href={comoLlegarUrl(seleccion)} target="_blank" rel="noreferrer" className="btn btn-ghost tap" style={{ flex: 1, textDecoration: 'none' }}>
                <IconNavegar size={20} stroke={2.4} /> Cómo llegar
              </a>
              <button className="btn btn-primary tap" style={{ flex: 1.3 }} onClick={() => navigate(`/visita/${seleccion.id}`, { state: { prospecto: seleccion } })}>
                Registrar visita
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

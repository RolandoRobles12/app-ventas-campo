import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Prospecto } from '../../api';
import { useSession } from '../../session';
import { CameraCapture } from '../../components/CameraCapture';
import { guardarVisitaPendiente, marcarVisitaLocal, prospectosConCache, rutaEnCache } from '../../offline';
import { subirFotos } from '../../uploadFotos';
import { comoLlegarUrl, distanciaMetros, textoDistancia } from '../../ruta';
import { etiquetaDia, fechaLocal, sumarDias } from '../../fechas';
import { RESULTADOS_UI } from '../../resultados';
import { IconAtras, IconCamara, IconCheck, IconMas, IconNavegar, IconPin, IconTelefono, IconX } from '../../icons';

const GIROS = ['Abarrotes', 'Ferretería', 'Papelería', 'Alimentos', 'Belleza', 'Taller', 'Servicios', 'Otro'];
// Mismo tope que MAX_FOTOS_POR_VISITA en server/src/routes/visitas.ts (el
// servidor es quien lo hace cumplir; este solo es para la interfaz).
const MAX_FOTOS = 5;
// Mismo radio que RADIO_UBICACION_VALIDA_METROS del servidor: dentro de él,
// la visita cuenta en el admin como "hecha en el negocio".
const RADIO_VERIFICADA_M = 50;
const REAGENDA = 'Se reagenda visita';
const NOTAS_RAPIDAS = ['No estaba el dueño', 'Pidió que regrese', 'Ya tiene crédito', 'Lo va a pensar', 'Negocio cerrado hoy'];

type GpsFix = { lat: number; lng: number; accuracy: number };
type GpsState = { status: 'buscando' } | { status: 'ok'; fix: GpsFix } | { status: 'error'; message: string };

function useGps(): GpsState {
  const [gps, setGps] = useState<GpsState>({ status: 'buscando' });
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGps({ status: 'error', message: 'Este dispositivo no tiene GPS disponible' });
      return;
    }
    // watchPosition en lugar de getCurrentPosition: el primer fix suele ser burdo
    // (por red) y los siguientes lo van afinando mientras se llena el formulario.
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setGps({ status: 'ok', fix: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) } }),
      (err) => setGps((prev) => (prev.status === 'ok' ? prev : {
        status: 'error',
        message: err.code === err.PERMISSION_DENIED ? 'Permiso de ubicación denegado' : 'No se pudo obtener tu ubicación',
      })),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  return gps;
}

export function RegistrarVisita({ nueva = false }: { nueva?: boolean }) {
  const { vendedor } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const gps = useGps();

  // La lista manda el negocio en el estado de navegación: abre al instante y
  // sin depender de la red. El caché es el respaldo si se entra por URL.
  const [prospecto, setProspecto] = useState<Prospecto | null>(() => {
    const desdeLista = (location.state as { prospecto?: Prospecto } | null)?.prospecto;
    if (desdeLista || nueva || !vendedor) return desdeLista ?? null;
    return rutaEnCache(vendedor.id)?.find((p) => p.id === id) ?? null;
  });
  const [buscando, setBuscando] = useState(!prospecto && !nueva);
  useEffect(() => {
    if (prospecto || nueva || !vendedor) return;
    prospectosConCache(vendedor.id)
      .then((lista) => setProspecto(lista.find((p) => p.id === id) ?? null))
      .catch(() => {})
      .finally(() => setBuscando(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [giro, setGiro] = useState('');
  const [resultado, setResultado] = useState('');
  const [reagendarPara, setReagendarPara] = useState(() => sumarDias(fechaLocal(), 1));
  const [notas, setNotas] = useState('');
  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>([]);
  const [camara, setCamara] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Tras el primer intento de guardar, lo que falte se marca en rojo (el botón
  // nunca se deshabilita: un botón apagado sin explicación solo confunde).
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState('');
  const refs = { nombre: useRef<HTMLDivElement>(null), resultado: useRef<HTMLDivElement>(null), foto: useRef<HTMLDivElement>(null) };

  // Libera las vistas previas al salir (con las que haya en ese momento).
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  useEffect(() => () => fotosRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), []);

  if (!vendedor) return null;
  if (!nueva && !prospecto && buscando) return <div style={{ padding: 28, textAlign: 'center', color: '#6f7d75', fontWeight: 600 }}>Cargando…</div>;
  if (!nueva && !prospecto) {
    return (
      <div style={{ padding: 28, textAlign: 'center' }}>
        <p style={{ fontSize: 16, color: '#6f7d75', fontWeight: 600 }}>No encontramos este negocio en tu ruta.</p>
        <button className="btn btn-primary tap" onClick={() => navigate('/')}>Volver a mi ruta</button>
      </div>
    );
  }

  const faltaNombre = nueva && !nombre.trim();
  const faltaResultado = !resultado;
  const faltaFoto = fotos.length === 0;
  const faltantes = [faltaNombre && 'nombre', faltaResultado && 'resultado', faltaFoto && 'foto'].filter(Boolean) as string[];

  // Solo los negocios del DENUE tienen una ubicación de referencia contra la
  // cual el servidor valida (ver POST /visitas).
  const distanciaNegocio = gps.status === 'ok' && prospecto?.origen === 'denue' && prospecto.lat != null && prospecto.lng != null
    ? distanciaMetros(gps.fix, { lat: prospecto.lat, lng: prospecto.lng })
    : null;

  const tomarFoto = (file: File) => {
    setFotos((prev) => [...prev, { file, preview: URL.createObjectURL(file) }]);
    setCamara(false);
  };

  const agregarNota = (n: string) => setNotas((prev) => (prev.includes(n) ? prev : prev ? `${prev.trim()}. ${n}` : n));

  const guardar = async () => {
    if (faltantes.length) {
      setIntento(true);
      setError('');
      const primero = faltaNombre ? refs.nombre : faltaResultado ? refs.resultado : refs.foto;
      primero.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setGuardando(true);
    setError('');

    const nombreNegocio = nueva ? nombre.trim() : prospecto!.nombre;
    const campos: Record<string, string> = { vendedorId: vendedor.id, resultado, nombreNegocio };
    if (notas.trim()) campos.notas = notas.trim();
    if (gps.status === 'ok') {
      campos.lat = String(gps.fix.lat);
      campos.lng = String(gps.fix.lng);
      campos.gpsAccuracy = String(gps.fix.accuracy);
    }
    if (nueva) {
      campos.esNegocioNuevo = 'true';
      campos.direccion = direccion.trim() || 'Ubicación actual';
      if (giro) campos.giro = giro;
    } else {
      campos.prospectoId = prospecto!.id;
      campos.direccion = prospecto!.direccion;
      if (resultado === REAGENDA) campos.reagendarPara = reagendarPara;
    }
    const capturadoEn = Date.now();

    const terminar = (pendiente: boolean) => {
      if (!nueva) {
        marcarVisitaLocal(vendedor.id, prospecto!.id, resultado === REAGENDA
          ? { estado: 'por_visitar', fechaPlan: reagendarPara, reagendado: true }
          : { estado: 'visitado' });
      }
      navigate('/visita/exito', { replace: true, state: { nombre: nombreNegocio, resultado, fotos: fotos.length, pendiente, reagendarPara: resultado === REAGENDA ? reagendarPara : null } });
    };

    // Sin señal, la visita no se pierde: queda en la tablet (IndexedDB) y
    // OfflineSync la envía en cuanto haya conexión.
    const encolar = async () => {
      await guardarVisitaPendiente({ campos, fotos: fotos.map((f) => f.file), nombreNegocio, capturadoEn });
      terminar(true);
    };

    try {
      if (!navigator.onLine) {
        await encolar();
        return;
      }
      const urls = await subirFotos(vendedor.id, fotos.map((f) => f.file));
      await api.registrarVisita({ ...campos, capturadoEn, fotos: urls });
      terminar(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // fetch tronó a mitad del envío: es falta de red, no un rechazo
        await encolar().catch(() => setError('No se pudo guardar la visita. Intenta de nuevo.'));
      }
    } finally {
      setGuardando(false);
    }
  };

  const hoy = fechaLocal();
  const opcionesReagenda = [sumarDias(hoy, 1), sumarDias(hoy, 2), sumarDias(hoy, 7)];

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 5, background: '#eef5f0', borderBottom: '1px solid #dfe9e2' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <button onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/'))} aria-label="Regresar" className="tap" style={{ width: 52, height: 52, borderRadius: 16, background: '#fff', border: '1px solid #dfe9e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <IconAtras size={26} stroke={2.6} />
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '1px', color: '#6f7d75' }}>{nueva ? 'NEGOCIO NUEVO' : 'REGISTRAR VISITA'}</div>
            <div className="ellipsis" style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink-900)' }}>{nueva ? (nombre.trim() || 'Negocio fuera de ruta') : prospecto!.nombre}</div>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, width: '100%', maxWidth: 860, margin: '0 auto', padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {!nueva && prospecto && (
          <section className="card" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, fontWeight: 600, color: '#3a4a41', lineHeight: 1.45 }}>
              <span style={{ color: '#15915c', flex: 'none', marginTop: 1 }}><IconPin size={20} /></span>
              <span>{[prospecto.giro, prospecto.direccion].filter(Boolean).join(' · ')}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <a href={comoLlegarUrl(prospecto)} target="_blank" rel="noreferrer" className="btn btn-ghost tap" style={{ flex: 1, minWidth: 160, textDecoration: 'none' }}>
                <IconNavegar size={20} stroke={2.4} /> Cómo llegar
              </a>
              {prospecto.telefono && (
                <a href={`tel:${prospecto.telefono.replace(/[^+\d]/g, '')}`} className="btn btn-ghost tap" style={{ flex: 1, minWidth: 160, textDecoration: 'none' }}>
                  <IconTelefono size={20} /> Llamar
                </a>
              )}
            </div>
            <Ubicacion gps={gps} distancia={distanciaNegocio} />
          </section>
        )}

        {nueva && (
          <section className="card" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div ref={refs.nombre}>
              <Etiqueta falta={intento && faltaNombre} aviso="escribe el nombre">Nombre del negocio</Etiqueta>
              <input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Tortillería La Espiga" style={intento && faltaNombre ? { borderColor: '#e29a90' } : undefined} />
            </div>
            <div>
              <Etiqueta>Giro</Etiqueta>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {GIROS.map((g) => (
                  <button key={g} className="chip tap" aria-pressed={giro === g} onClick={() => setGiro(giro === g ? '' : g)}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <Etiqueta>Dirección o referencia <span style={{ fontWeight: 600, color: '#8a978f' }}>(opcional)</span></Etiqueta>
              <input className="field" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Si la dejas vacía, usamos tu ubicación GPS" />
            </div>
            <Ubicacion gps={gps} distancia={null} />
          </section>
        )}

        <section ref={refs.resultado} className="card" style={{ padding: 18 }}>
          <Etiqueta falta={intento && faltaResultado} aviso="elige una opción">¿Cómo te fue?</Etiqueta>
          <div className="resultados-grid">
            {RESULTADOS_UI.filter((r) => !(nueva && r.valor === REAGENDA)).map((r) => {
              const activo = resultado === r.valor;
              return (
                <button
                  key={r.valor}
                  className="tap"
                  onClick={() => setResultado(r.valor)}
                  aria-pressed={activo}
                  style={{
                    minHeight: 84, borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    border: `2.5px solid ${activo ? r.color : intento && faltaResultado ? '#f0b9b0' : '#e2eae4'}`,
                    background: activo ? r.fondo : '#fafcfa',
                  }}
                >
                  <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, background: activo ? '#fff' : r.fondo, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <r.Icon size={24} />
                  </span>
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: activo ? r.color : 'var(--ink-600)', lineHeight: 1.25 }}>{r.etiqueta}</span>
                  {activo && <span style={{ color: r.color }}><IconCheck size={22} stroke={3} /></span>}
                </button>
              );
            })}
          </div>

          {resultado === REAGENDA && !nueva && (
            <div className="aparecer" style={{ marginTop: 16, background: '#f2f7fd', borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1d5fae', marginBottom: 10 }}>¿Cuándo regresas?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {opcionesReagenda.map((f, i) => (
                  <button key={f} className="chip tap" aria-pressed={reagendarPara === f} onClick={() => setReagendarPara(f)}>
                    {i === 2 ? 'En una semana' : etiquetaDia(f, hoy)}
                  </button>
                ))}
                <input
                  type="date" className="field" min={sumarDias(hoy, 1)} value={reagendarPara}
                  onChange={(e) => e.target.value && setReagendarPara(e.target.value)}
                  style={{ width: 'auto', minHeight: 44, padding: '8px 12px' }}
                />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4a6a8f', marginTop: 10 }}>El negocio vuelve a tu ruta ese día.</div>
            </div>
          )}
        </section>

        <section ref={refs.foto} className="card" style={{ padding: 18 }}>
          <Etiqueta falta={intento && faltaFoto} aviso="toma al menos una">
            Foto de evidencia {fotos.length > 0 && <span style={{ color: '#8a978f', fontWeight: 600 }}>({fotos.length}/{MAX_FOTOS})</span>}
          </Etiqueta>
          {fotos.length === 0 ? (
            <button
              className="tap"
              onClick={() => setCamara(true)}
              style={{
                width: '100%', minHeight: 150, borderRadius: 16, border: `2.5px dashed ${intento && faltaFoto ? '#e29a90' : '#b7cabf'}`,
                background: '#fafcfa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <span style={{ width: 62, height: 62, borderRadius: '50%', background: 'var(--aviva-green-700)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconCamara size={30} />
              </span>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink-800)' }}>Tomar foto</span>
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {fotos.map((f, i) => (
                <div key={f.preview} style={{ position: 'relative', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', backgroundImage: `url(${f.preview})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                  <button
                    onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Quitar foto"
                    className="tap"
                    style={{ position: 'absolute', top: 6, right: 6, width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <IconX size={20} stroke={2.8} />
                  </button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <button className="tap" onClick={() => setCamara(true)} style={{ aspectRatio: '1', borderRadius: 14, border: '2.5px dashed #b7cabf', background: '#fafcfa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--aviva-green-700)' }}>
                  <IconMas size={26} stroke={2.6} />
                  <span style={{ fontSize: 14, fontWeight: 800 }}>Otra foto</span>
                </button>
              )}
            </div>
          )}
        </section>

        <section className="card" style={{ padding: 18 }}>
          <Etiqueta>Notas <span style={{ fontWeight: 600, color: '#8a978f' }}>(opcional)</span></Etiqueta>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {NOTAS_RAPIDAS.map((n) => (
              <button key={n} className="chip tap" aria-pressed={notas.includes(n)} onClick={() => agregarNota(n)}>{n}</button>
            ))}
          </div>
          <textarea className="field" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Algo que quieras recordar de esta visita…" rows={3} style={{ resize: 'none' }} />
        </section>
      </div>

      <footer style={{ position: 'sticky', bottom: 0, zIndex: 5, background: '#fff', borderTop: '1px solid #dfe9e2', padding: '12px 16px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {error && <div style={{ color: '#b23a2b', fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{error}</div>}
          <button
            onClick={guardar}
            disabled={guardando}
            className="btn tap"
            style={{ width: '100%', minHeight: 62, fontSize: 19, background: faltantes.length ? '#9fb5a8' : 'var(--aviva-green-700)', color: '#fff' }}
          >
            {guardando ? 'Guardando…' : faltantes.length ? `Falta: ${faltantes.join(', ')}` : <><IconCheck size={24} stroke={3} /> Guardar visita</>}
          </button>
        </div>
      </footer>

      {camara && <CameraCapture onCapture={tomarFoto} onClose={() => setCamara(false)} />}
    </div>
  );
}

function Etiqueta({ children, falta = false, aviso }: { children: React.ReactNode; falta?: boolean; aviso?: string }) {
  return (
    <div style={{ fontSize: 17, fontWeight: 800, color: falta ? '#b23a2b' : 'var(--ink-800)', marginBottom: 12 }}>
      {children} {falta && aviso && <span style={{ fontSize: 15, fontWeight: 700 }}>· {aviso}</span>}
    </div>
  );
}

// Dónde está el vendedor respecto al negocio: dentro de 50 m la visita
// cuenta como hecha en el negocio; más lejos se le avisa (no se le bloquea).
function Ubicacion({ gps, distancia }: { gps: GpsState; distancia: number | null }) {
  let fondo = '#eef5f0', color = '#356048', texto: string;
  if (gps.status === 'buscando') {
    fondo = '#fdf4e7'; color = '#8a5a1e'; texto = 'Buscando tu ubicación GPS…';
  } else if (gps.status === 'error') {
    fondo = '#fdecea'; color = '#8f3025'; texto = gps.message;
  } else if (distancia == null) {
    texto = `Ubicación capturada · precisión ±${gps.fix.accuracy} m`;
  } else if (distancia <= RADIO_VERIFICADA_M) {
    fondo = '#dcf1e5'; color = '#15703f'; texto = `Estás en el negocio (a ${textoDistancia(distancia)}) · la visita cuenta como hecha aquí`;
  } else {
    fondo = '#fdecdb'; color = '#8a4b0f'; texto = `Estás a ${textoDistancia(distancia)} del negocio · acércate a menos de 50 m para que cuente como hecha en el negocio`;
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: fondo, color, borderRadius: 12, padding: '11px 13px', marginTop: 14, fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
      <span style={{ flex: 'none', display: 'flex' }}><IconPin size={18} /></span>
      {texto}
    </div>
  );
}

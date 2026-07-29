import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Prospecto } from '../../api';
import { useSession } from '../../session';
import { MapPreview } from '../../components/MapPreview';
import { CameraCapture } from '../../components/CameraCapture';
import { guardarVisitaPendiente, prospectosConCache } from '../../offline';
import { subirFotos } from '../../uploadFotos';
import { RESULTADO_OPTIONS, resultadoColor } from '@aviva/ui';

const GIROS = ['Abarrotes', 'Ferretería', 'Papelería', 'Alimentos', 'Servicios', 'Otro'];
const MAX_FOTOS = 5;

type GpsFix = { lat: number; lng: number; accuracy: number };
type GpsState =
  | { status: 'buscando' }
  | { status: 'ok'; fix: GpsFix }
  | { status: 'error'; message: string };

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
      (pos) => setGps({
        status: 'ok',
        fix: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) },
      }),
      (err) => setGps((prev) => (prev.status === 'ok' ? prev : {
        status: 'error',
        message: err.code === err.PERMISSION_DENIED
          ? 'Permiso de ubicación denegado · actívalo para el mapa de calor'
          : 'No se pudo obtener la ubicación GPS',
      })),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 30000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  return gps;
}

export function VisitForm({ mode }: { mode: 'lead' | 'nuevo' }) {
  const { vendedor } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();

  // La lista manda el prospecto en el estado de navegación: el formulario
  // abre al instante y sin depender de la red; la consulta de abajo es solo
  // el respaldo para cuando se entra directo por URL (recarga, enlace).
  const [prospecto, setProspecto] = useState<Prospecto | null>(
    (location.state as { prospecto?: Prospecto } | null)?.prospecto ?? null,
  );
  const [customName, setCustomName] = useState('');
  const [customAddress, setCustomAddress] = useState('');
  const [customGiro, setCustomGiro] = useState('');
  const [resultado, setResultado] = useState('');
  const [notas, setNotas] = useState('');
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const [showCamera, setShowCamera] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Tras el primer intento fallido de guardar, los campos obligatorios que
  // falten se marcan en el formulario (el botón nunca se deshabilita: un botón
  // apagado sin explicación solo confunde).
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState('');
  const gps = useGps();

  useEffect(() => {
    if (mode === 'lead' && vendedor && id && !prospecto) {
      prospectosConCache(vendedor.id)
        .then((list) => setProspecto(list.find((p) => p.id === id) || null))
        .catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, vendedor, id]);

  if (!vendedor) return null;
  if (mode === 'lead' && !prospecto) {
    return <div style={{ padding: 24, color: 'var(--ink-300)' }}>Cargando…</div>;
  }

  const title = mode === 'nuevo' ? 'Visita nueva' : prospecto!.nombre;
  const kicker = mode === 'nuevo' ? 'NUEVO REGISTRO' : 'REGISTRO DE VISITA';
  const faltaResultado = intento && !resultado;
  const faltaFoto = intento && photos.length === 0;

  const onCaptured = (file: File) => {
    setPhotos((prev) => [...prev, { file, preview: URL.createObjectURL(file) }]);
    setShowCamera(false);
  };

  const quitarFoto = (index: number) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const submit = async () => {
    const faltantes: string[] = [];
    if (!resultado) faltantes.push('el resultado de la visita');
    if (photos.length === 0) faltantes.push('al menos una foto de evidencia');
    if (faltantes.length) {
      setIntento(true);
      setError(`Para guardar falta: ${faltantes.join(' y ')}.`);
      return;
    }

    setSubmitting(true);
    setError('');

    const nombre = mode === 'nuevo' ? (customName || 'Nuevo negocio') : prospecto!.nombre;
    const campos: Record<string, string> = { vendedorId: vendedor.id, resultado };
    if (notas) campos.notas = notas;
    if (gps.status === 'ok') {
      campos.lat = String(gps.fix.lat);
      campos.lng = String(gps.fix.lng);
      campos.gpsAccuracy = String(gps.fix.accuracy);
    }
    if (mode === 'nuevo') {
      campos.esNegocioNuevo = 'true';
      campos.nombreNegocio = nombre;
      campos.direccion = customAddress || 'Ubicación actual';
      if (customGiro) campos.giro = customGiro;
    } else {
      campos.prospectoId = prospecto!.id;
      campos.nombreNegocio = prospecto!.nombre;
      campos.direccion = prospecto!.direccion;
    }
    const capturadoEn = Date.now();

    const irAExito = (pendiente: boolean) => navigate('/visitas/exito', {
      state: { nombre, resultado, fotos: photos.length, pendiente },
    });

    // Sin señal, la visita no se pierde: queda en el teléfono (IndexedDB) y
    // OfflineSync la envía en cuanto haya conexión.
    const encolar = async () => {
      await guardarVisitaPendiente({ campos, fotos: photos.map((p) => p.file), nombreNegocio: nombre, capturadoEn });
      irAExito(true);
    };

    try {
      if (!navigator.onLine) {
        await encolar();
        return;
      }
      const fotos = await subirFotos(vendedor.id, photos.map((p) => p.file));
      await api.registrarVisita({ ...campos, capturadoEn, fotos });
      irAExito(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        // fetch tronó a mitad del envío: es falta de red, no un rechazo
        await encolar().catch(() => setError('No se pudo guardar la visita. Intenta de nuevo.'));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 18px 4px' }}>
        <button onClick={() => navigate('/visitas')} aria-label="Regresar" style={{ width: 40, height: 40, borderRadius: 13, border: 'none', background: '#fff', boxShadow: '0 3px 10px rgba(20,60,40,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1a1f1c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1px', color: 'var(--ink-100)' }}>{kicker}</div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)' }}>{title}</div>
        </div>
      </div>

      {mode === 'lead' && prospecto && (
        <>
          <MapPreview direccion={prospecto.direccion} telefono={prospecto.telefono} lat={prospecto.lat} lng={prospecto.lng} />
          <div style={{ margin: '12px 16px 0' }}><GpsBanner gps={gps} /></div>
        </>
      )}

      {mode === 'nuevo' && (
        <div style={{ margin: '12px 16px 0', background: '#fff', borderRadius: 20, padding: 16, boxShadow: '0 8px 24px rgba(20,60,40,.07)', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <GpsBanner gps={gps} />
          <Field label="Nombre del negocio">
            <input className="fld" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder="Ej. Tortillería La Espiga" style={inputStyle} />
          </Field>
          <Field label="Dirección o referencia (opcional)">
            <input className="fld" value={customAddress} onChange={(e) => setCustomAddress(e.target.value)} placeholder="Calle, número, colonia" style={inputStyle} />
          </Field>
          <Field label="Giro del negocio">
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {GIROS.map((g) => {
                const activo = customGiro === g;
                return (
                  <button
                    key={g}
                    onClick={() => setCustomGiro(activo ? '' : g)}
                    style={{
                      border: activo ? '1.5px solid var(--aviva-green-500)' : '1.5px solid #e4e6e2',
                      background: activo ? 'var(--aviva-green-100)' : '#f7f8f6',
                      color: activo ? '#15703f' : 'var(--ink-400)',
                      borderRadius: 20, padding: '9px 14px', fontSize: 13, fontWeight: 700,
                    }}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </Field>
        </div>
      )}

      <div style={{ margin: '14px 16px 0', background: '#fff', borderRadius: 22, padding: '18px 16px', boxShadow: '0 8px 24px rgba(20,60,40,.07)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: faltaResultado ? '#c0392b' : 'var(--ink-600)', marginBottom: 7 }}>
            Resultado de la visita {faltaResultado && <span style={{ fontWeight: 600 }}>· selecciona una opción</span>}
          </label>
          {/* Un toque por opción (en vez de un <select> nativo que pide abrir,
              hacer scroll y confirmar): es el campo que se llena en cada visita. */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {RESULTADO_OPTIONS.map((r) => {
              const activo = resultado === r;
              return (
                <button
                  key={r}
                  onClick={() => setResultado(r)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%',
                    border: activo ? '1.5px solid var(--aviva-green-500)' : faltaResultado ? '1.5px solid #f3b6ae' : '1.5px solid #e4e6e2',
                    background: activo ? 'var(--aviva-green-50)' : '#f7f8f6',
                    borderRadius: 14, padding: '13px 14px',
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: '50%', flex: 'none', background: resultadoColor(r), opacity: activo ? 1 : 0.45 }} />
                  <span style={{ flex: 1, fontSize: 14, fontWeight: activo ? 800 : 600, color: activo ? '#15703f' : 'var(--ink-600)' }}>{r}</span>
                  {activo && (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#15915c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        <Field label="Notas (opcional)">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalles de la conversación..." style={{ ...inputStyle, minHeight: 70, resize: 'none' }} />
        </Field>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: faltaFoto ? '#c0392b' : 'var(--ink-600)', marginBottom: 7 }}>
            Fotografía de evidencia {photos.length > 0
              ? <span style={{ color: 'var(--ink-300)', fontWeight: 500 }}>({photos.length}/{MAX_FOTOS})</span>
              : faltaFoto && <span style={{ fontWeight: 600 }}>· toma al menos una</span>}
          </label>
          {photos.length === 0 ? (
            <button onClick={() => setShowCamera(true)} style={{ width: '100%', height: 180, borderRadius: 16, border: faltaFoto ? '1.5px dashed #e29a90' : '1.5px dashed #b7cabf', background: '#f7f8f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--aviva-green-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(15,81,50,.28)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>Tomar foto con la cámara</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8a958c' }}>Solo cámara · no se permiten archivos</span>
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {photos.map((p, i) => (
                <div key={p.preview} style={{ position: 'relative', height: 90, borderRadius: 12, overflow: 'hidden', backgroundImage: `url(${p.preview})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                  <button
                    onClick={() => quitarFoto(i)}
                    aria-label="Quitar foto"
                    style={{ position: 'absolute', top: 5, right: 5, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                  </button>
                </div>
              ))}
              {photos.length < MAX_FOTOS && (
                <button onClick={() => setShowCamera(true)} style={{ height: 90, borderRadius: 12, border: '1.5px dashed #b7cabf', background: '#f7f8f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aviva-green-700)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--ink-400)' }}>Añadir foto</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {error && <div style={{ margin: '12px 16px 0', color: '#c0392b', fontSize: 13, fontWeight: 600 }}>{error}</div>}

      <div style={{ padding: '16px 16px 0' }}>
        <button
          onClick={submit} disabled={submitting}
          style={{
            width: '100%', border: 'none', background: 'var(--aviva-orange-500)', color: 'var(--aviva-orange-900)',
            fontSize: 16, fontWeight: 800, padding: 16, borderRadius: 18, boxShadow: '0 10px 24px rgba(239,139,62,.4)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9,
            opacity: submitting ? 0.6 : 1,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aviva-orange-900)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          {submitting ? 'Guardando…' : 'Guardar visita'}
        </button>
      </div>

      {showCamera && <CameraCapture onCapture={onCaptured} onClose={() => setShowCamera(false)} />}
    </div>
  );
}

function GpsBanner({ gps }: { gps: GpsState }) {
  const palette = {
    buscando: { bg: '#fdf4e7', ink: '#8a5a1e', dot: '#ef8b3e' },
    ok: { bg: 'var(--aviva-green-50)', ink: '#356048', dot: '#15915c' },
    error: { bg: '#fdecea', ink: '#8f3025', dot: '#c0392b' },
  }[gps.status];
  const label = gps.status === 'buscando'
    ? 'Buscando señal GPS…'
    : gps.status === 'ok'
      ? `Ubicación GPS capturada · precisión ±${gps.fix.accuracy} m`
      : gps.message;

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: palette.bg, borderRadius: 12, padding: '9px 12px' }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke={palette.dot} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      <span style={{ fontSize: 12.5, fontWeight: 600, color: palette.ink }}>{label}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink-600)', marginBottom: 7 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', border: '1.5px solid #e4e6e2', background: '#f7f8f6', borderRadius: 13, padding: '13px 14px',
  fontSize: 14, fontWeight: 600, color: 'var(--ink-800)',
};

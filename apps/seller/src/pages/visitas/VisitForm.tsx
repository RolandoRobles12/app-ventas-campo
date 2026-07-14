import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, type Prospecto } from '../../api';
import { useSession } from '../../session';
import { MapPreview } from '../../components/MapPreview';
import { RESULTADO_OPTIONS } from '@aviva/ui';

const GIROS = ['Abarrotes', 'Ferretería', 'Papelería', 'Alimentos', 'Servicios', 'Otro'];

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

  const [prospecto, setProspecto] = useState<Prospecto | null>(null);
  const [customName, setCustomName] = useState('');
  const [customAddress, setCustomAddress] = useState('Ubicación actual detectada por GPS');
  const [customGiro, setCustomGiro] = useState('');
  const [resultado, setResultado] = useState('');
  const [notas, setNotas] = useState('');
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const gps = useGps();

  useEffect(() => {
    if (mode === 'lead' && vendedor && id) {
      api.prospectos(vendedor.id).then((list) => setProspecto(list.find((p) => p.id === id) || null));
    }
  }, [mode, vendedor, id]);

  if (!vendedor) return null;
  if (mode === 'lead' && !prospecto) {
    return <div style={{ padding: 24, color: 'var(--ink-300)' }}>Cargando…</div>;
  }

  const title = mode === 'nuevo' ? 'Visita nueva' : prospecto!.nombre;
  const kicker = mode === 'nuevo' ? 'NUEVO REGISTRO' : 'REGISTRO DE VISITA';

  const onPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhoto({ file, preview: URL.createObjectURL(file) });
  };

  const submit = async () => {
    if (!resultado) { setError('Selecciona el resultado de la visita'); return; }
    setSubmitting(true);
    setError('');
    try {
      const fd = new FormData();
      fd.append('vendedorId', vendedor.id);
      fd.append('resultado', resultado);
      if (notas) fd.append('notas', notas);
      if (photo) fd.append('foto', photo.file);
      if (gps.status === 'ok') {
        fd.append('lat', String(gps.fix.lat));
        fd.append('lng', String(gps.fix.lng));
        fd.append('gpsAccuracy', String(gps.fix.accuracy));
      }

      if (mode === 'nuevo') {
        fd.append('esNegocioNuevo', 'true');
        fd.append('nombreNegocio', customName || 'Nuevo negocio');
        fd.append('direccion', customAddress || 'Ubicación actual');
        if (customGiro) fd.append('giro', customGiro);
      } else {
        fd.append('prospectoId', prospecto!.id);
        fd.append('nombreNegocio', prospecto!.nombre);
        fd.append('direccion', prospecto!.direccion);
      }

      await api.registrarVisita(fd);
      navigate('/visitas/exito', {
        state: {
          nombre: mode === 'nuevo' ? (customName || 'Nuevo negocio') : prospecto!.nombre,
          resultado,
          hasPhoto: !!photo,
        },
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar la visita');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ padding: '0 0 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 18px 4px' }}>
        <button onClick={() => navigate('/visitas')} style={{ width: 40, height: 40, borderRadius: 13, border: 'none', background: '#fff', boxShadow: '0 3px 10px rgba(20,60,40,.08)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
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
          <Field label="Dirección o referencia">
            <input className="fld" value={customAddress} onChange={(e) => setCustomAddress(e.target.value)} placeholder="Calle, número, colonia" style={inputStyle} />
          </Field>
          <Field label="Giro del negocio">
            <select className="fld" value={customGiro} onChange={(e) => setCustomGiro(e.target.value)} style={inputStyle}>
              <option value="">Selecciona el giro</option>
              {GIROS.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </Field>
        </div>
      )}

      <div style={{ margin: '14px 16px 0', background: '#fff', borderRadius: 22, padding: '18px 16px', boxShadow: '0 8px 24px rgba(20,60,40,.07)', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <Field label="Resultado de la visita">
          <select className="fld" value={resultado} onChange={(e) => setResultado(e.target.value)} style={inputStyle}>
            <option value="">Selecciona una opción</option>
            {RESULTADO_OPTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </Field>

        <Field label="Notas (opcional)">
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Detalles de la conversación..." style={{ ...inputStyle, minHeight: 70, resize: 'none' }} />
        </Field>

        <div>
          <label style={{ display: 'block', fontSize: 13, fontWeight: 700, color: 'var(--ink-600)', marginBottom: 7 }}>Fotografía de evidencia</label>
          <input ref={fileRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} style={{ display: 'none' }} />
          {photo ? (
            <div onClick={() => fileRef.current?.click()} style={{ position: 'relative', height: 180, borderRadius: 16, overflow: 'hidden', backgroundImage: `url(${photo.preview})`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', right: 10, bottom: 10, display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(0,0,0,.6)', color: '#fff', fontSize: 12.5, fontWeight: 700, padding: '8px 12px', borderRadius: 20 }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                Volver a tomar
              </span>
            </div>
          ) : (
            <button onClick={() => fileRef.current?.click()} style={{ width: '100%', height: 180, borderRadius: 16, border: '1.5px dashed #b7cabf', background: '#f7f8f6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--aviva-green-700)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 6px 16px rgba(15,81,50,.28)' }}>
                <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </div>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>Tomar foto con la cámara</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: '#8a958c' }}>Solo cámara · no se permiten archivos</span>
            </button>
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
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, opacity: submitting ? 0.7 : 1,
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--aviva-orange-900)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
          {submitting ? 'Guardando…' : 'Guardar visita'}
        </button>
      </div>
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

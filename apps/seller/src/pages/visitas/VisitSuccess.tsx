import { useLocation, useNavigate } from 'react-router-dom';

interface State {
  nombre: string;
  resultado: string;
  hasPhoto: boolean;
}

export function VisitSuccess() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const s = (state as State) || { nombre: 'el negocio', resultado: '—', hasPhoto: false };

  return (
    <div style={{ padding: '0 20px', minHeight: 700, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
      <div style={{ width: 96, height: 96, borderRadius: '50%', background: 'var(--aviva-green-500)', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 14px 34px rgba(34,163,108,.4)' }}>
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7"/></svg>
      </div>
      <h2 style={{ margin: '24px 0 0', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)' }}>¡Visita registrada!</h2>
      <p style={{ margin: '10px 0 0', fontSize: 15, fontWeight: 500, color: 'var(--ink-300)', lineHeight: 1.5, maxWidth: 280 }}>
        La evidencia de <b style={{ color: 'var(--ink-800)' }}>{s.nombre}</b> se guardó correctamente.
      </p>

      <div style={{ marginTop: 26, width: '100%', background: '#fff', borderRadius: 20, padding: '16px 18px', boxShadow: '0 8px 24px rgba(20,60,40,.07)', textAlign: 'left', display: 'flex', flexDirection: 'column', gap: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#7a857d', flex: 'none' }}>Resultado</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-800)', textAlign: 'right' }}>{s.resultado}</span>
        </div>
        <div style={{ height: 1, background: '#eef0ec' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#7a857d' }}>Evidencia</span>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink-800)' }}>{s.hasPhoto ? 'Foto adjunta' : 'Sin foto'}</span>
        </div>
      </div>

      <button
        onClick={() => navigate('/visitas')}
        style={{ marginTop: 22, width: '100%', border: 'none', background: 'var(--aviva-green-700)', color: '#fff', fontSize: 16, fontWeight: 700, padding: 16, borderRadius: 18, boxShadow: '0 10px 24px rgba(15,81,50,.3)' }}
      >
        Volver a la lista
      </button>
    </div>
  );
}

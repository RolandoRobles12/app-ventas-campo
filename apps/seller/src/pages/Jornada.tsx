import { useEffect, useState } from 'react';
import { api, type JornadaHoy } from '../api';
import { useSession } from '../session';

export function Jornada() {
  const { vendedor } = useSession();
  const [jornada, setJornada] = useState<JornadaHoy | null>(null);
  const [busy, setBusy] = useState(false);

  const load = () => {
    if (!vendedor) return;
    api.jornadaHoy(vendedor.id).then(setJornada).catch(() => {});
  };

  useEffect(load, [vendedor]);

  if (!vendedor) return null;

  const toggle = async () => {
    setBusy(true);
    try {
      const updated = await api.toggleJornada(vendedor.id);
      setJornada(updated);
    } finally {
      setBusy(false);
    }
  };

  const activa = jornada?.activa ?? false;

  return (
    <div style={{ minHeight: 778 }}>
      <div style={{ padding: '22px 20px 0' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--ink-100)' }}>
          {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
        </div>
        <h1 style={{ margin: '5px 0 0', fontSize: 29, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-.5px' }}>Mi jornada</h1>
      </div>

      <div style={{ margin: '20px 16px 0', background: 'var(--aviva-green-700)', borderRadius: 24, padding: '26px 20px', textAlign: 'center', boxShadow: '0 12px 30px rgba(15,81,50,.24)' }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--aviva-green-200)' }}>{activa ? 'Jornada en curso' : 'Jornada no iniciada'}</div>
        <div style={{ fontSize: 46, fontWeight: 800, color: '#fff', letterSpacing: '-1px', margin: '6px 0 2px' }}>
          {jornada?.horaEntrada || '00:00'}
        </div>
        <button
          onClick={toggle} disabled={busy}
          style={{
            marginTop: 16, border: 'none', fontSize: 15, fontWeight: 700, padding: '13px 28px', borderRadius: 15,
            background: activa ? 'var(--aviva-orange-500)' : '#fff', color: activa ? 'var(--aviva-orange-900)' : 'var(--aviva-green-700)',
            opacity: busy ? 0.7 : 1,
          }}
        >
          {activa ? 'Finalizar jornada' : 'Iniciar jornada'}
        </button>
      </div>

      <div style={{ margin: '16px 16px 0', background: '#fff', borderRadius: 22, padding: 18, boxShadow: '0 8px 24px rgba(20,60,40,.07)' }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1px', color: '#8b938b', marginBottom: 14 }}>REGISTRO DE HOY</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: '#dfeee5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#3f6b54" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
            </div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--ink-600)' }}>Inicio de jornada</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>{jornada?.horaEntrada || '--:--'}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--aviva-orange-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#e07a26" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
            </div>
            <span style={{ flex: 1, fontSize: 14, fontWeight: 600, color: 'var(--ink-600)' }}>Visitas realizadas</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink-800)' }}>{jornada?.visitasHoy ?? 0}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

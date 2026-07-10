import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Metas, type JornadaHoy } from '../api';
import { useSession } from '../session';
import { GoalCard } from '../components/GoalCard';

const fmtMXN = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`;

const iconSolicitudes = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8fcfae" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
);
const iconColocacion = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b3a9ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 6v2m0 8v2"/></svg>
);

const REGISTRO = [
  { key: 'entrada', label: 'Entrada', activeBg: '#dfeee5', stroke: '#3f6b54', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#3f6b54" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg> },
  { key: 'comer', label: 'Salida a comer', activeBg: '#fdecdb', stroke: '#e07a26', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#e07a26" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8h1a4 4 0 0 1 0 8h-1"/><path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4Z"/></svg> },
  { key: 'regreso', label: 'Regreso', activeBg: '#f1f3f0', stroke: '#8a958c', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a958c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 2v7c0 1.1.9 2 2 2h0a2 2 0 0 0 2-2V2"/><path d="M5 2v20"/><path d="M16 2v20"/><path d="M16 8c0-3 1-6 3-6v20"/></svg> },
  { key: 'salida', label: 'Salida', activeBg: '#f1f3f0', stroke: '#8a958c', icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8a958c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg> },
] as const;

export function Home() {
  const { vendedor } = useSession();
  const navigate = useNavigate();
  const [metas, setMetas] = useState<Metas | null>(null);
  const [jornada, setJornada] = useState<JornadaHoy | null>(null);

  useEffect(() => {
    if (!vendedor) return;
    api.metasHoy(vendedor.id).then(setMetas).catch(() => {});
    api.jornadaHoy(vendedor.id).then(setJornada).catch(() => {});
  }, [vendedor]);

  if (!vendedor) return null;

  const sol = metas?.solicitudesHoy;
  const col = metas?.colocacionMes;
  const solPct = sol && sol.meta > 0 ? Math.round((sol.actual / sol.meta) * 100) : 0;
  const colPct = col && col.meta > 0 ? Math.round((col.actual / col.meta) * 100) : 0;
  const solFaltan = sol ? Math.max(0, sol.meta - sol.actual) : 0;

  return (
    <div style={{ paddingBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 4px' }}>
        <div style={{
          width: 62, height: 62, borderRadius: '50%', background: vendedor.color, display: 'flex',
          alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22,
          boxShadow: '0 6px 16px rgba(34,189,120,.32)',
        }}>{vendedor.iniciales}</div>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#bcd9c9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1f4d39" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        </div>
      </div>

      <div style={{ padding: '6px 20px 0' }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-.5px' }}>Administrar jornada</h1>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--ink-300)', fontWeight: 500, lineHeight: 1.4 }}>Controla tus horas de trabajo y tiempos de descanso.</p>
      </div>

      <div style={{ margin: '20px 16px 0', background: '#fff', borderRadius: 26, padding: '18px 16px 16px', boxShadow: '0 8px 28px rgba(20,60,40,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 4px 14px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1px', color: '#8b938b' }}>MI AVANCE HOY</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--aviva-orange-100)', padding: '5px 10px', borderRadius: 20 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--aviva-orange-500)" stroke="none"><path d="M12 2c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-.5-3 2 2 3.5 4.5 3.5 8a8 8 0 0 1-16 0c0-3 1.5-5.5 4-8 0 2 1 3 2 3.5C12.5 8 11 5 12 2Z"/></svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--aviva-orange-600)' }}>{jornada?.racha ?? 0} {jornada?.racha === 1 ? 'día' : 'días'} en racha</span>
          </span>
        </div>

        <div style={{ display: 'flex', gap: 13 }}>
          <GoalCard
            variant="green" icon={iconSolicitudes} label="SOLICITUDES HOY"
            valueLabel={String(sol?.actual ?? 0)} metaLabel={`/ ${sol?.meta ?? 0}`} pct={solPct}
            faltanLabel={String(solFaltan)} logradoLabel={String(sol?.actual ?? 0)}
          />
          <GoalCard
            variant="purple" icon={iconColocacion} label="COLOCACIÓN DEL MES"
            valueLabel={fmtMXN(col?.actual ?? 0)} metaLabel={`/ ${fmtMXN(col?.meta ?? 0)}`} pct={colPct}
            faltanLabel={fmtMXN(Math.max(0, (col?.meta ?? 0) - (col?.actual ?? 0)))} logradoLabel={fmtMXN(col?.actual ?? 0)}
          />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 9, margin: '14px 4px 2px', background: 'var(--aviva-green-50)', borderRadius: 14, padding: '12px 14px' }}>
          <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--aviva-green-100)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#15915c" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#356048', lineHeight: 1.4 }}>
            {solFaltan > 0 ? `Te faltan ${solFaltan} solicitudes para tu meta de hoy. ¡Tú puedes!` : '¡Alcanzaste tu meta de solicitudes de hoy!'}
          </span>
        </div>
      </div>

      <div style={{ margin: '16px 16px 0', background: '#fff', borderRadius: 26, padding: 18, boxShadow: '0 8px 28px rgba(20,60,40,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1a1f1c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
            <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--ink-800)' }}>Registro de actividad</span>
          </div>
          <span style={{ fontSize: 12, fontWeight: 600, color: '#5a6b61', background: '#f1f3f0', padding: '6px 10px', borderRadius: 14 }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}
          </span>
        </div>
        <div style={{ display: 'flex' }}>
          {REGISTRO.map((r, i) => {
            const value = r.key === 'entrada' ? jornada?.horaEntrada : r.key === 'comer' ? jornada?.horaSalidaComer : r.key === 'regreso' ? jornada?.horaRegreso : jornada?.horaSalida;
            return (
              <div key={r.key} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, borderRight: i < REGISTRO.length - 1 ? '1px solid #eef0ec' : 'none', padding: '0 4px' }}>
                <div style={{ width: 42, height: 42, borderRadius: '50%', background: r.activeBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{r.icon}</div>
                <span style={{ fontSize: 11, fontWeight: 600, color: '#3a443d' }}>{r.label}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: value ? 'var(--ink-800)' : '#b9c1ba' }}>{value || '--:--'}</span>
              </div>
            );
          })}
        </div>
      </div>

      <button
        onClick={() => navigate('/jornada')}
        style={{
          position: 'fixed', bottom: 86, right: 18, display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--aviva-orange-500)', padding: '14px 22px', borderRadius: 30, border: 'none',
          boxShadow: '0 10px 24px rgba(239,139,62,.4)',
        }}
      >
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--aviva-orange-900)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--aviva-orange-900)' }}>Jornada</span>
      </button>
    </div>
  );
}

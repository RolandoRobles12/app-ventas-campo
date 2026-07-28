import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Metas, type Prospecto } from '../api';
import { useSession } from '../session';
import { GoalCard } from '../components/GoalCard';
import { prospectosConCache } from '../offline';

const fmtMXN = (n: number) => `$${Math.round(n).toLocaleString('es-MX')}`;

const iconSolicitudes = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8fcfae" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
);
const iconColocacion = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#b3a9ee" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8"/><path d="M12 6v2m0 8v2"/></svg>
);

export function Home() {
  const { vendedor, salir } = useSession();
  const navigate = useNavigate();
  const [metas, setMetas] = useState<Metas | null>(null);
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [confirmandoSalir, setConfirmandoSalir] = useState(false);

  useEffect(() => {
    if (!vendedor) return;
    api.metasHoy(vendedor.id).then(setMetas).catch(() => {});
    prospectosConCache(vendedor.id).then(setProspectos).catch(() => {});
  }, [vendedor]);

  if (!vendedor) return null;

  const sol = metas?.solicitudesHoy;
  const col = metas?.colocacionMes;
  const solPct = sol && sol.meta > 0 ? Math.round((sol.actual / sol.meta) * 100) : 0;
  const colPct = col && col.meta > 0 ? Math.round((col.actual / col.meta) * 100) : 0;
  const solFaltan = sol ? Math.max(0, sol.meta - sol.actual) : 0;
  const porVisitar = prospectos.filter((p) => p.estado === 'por_visitar').length;
  const primerNombre = vendedor.nombre.split(' ')[0];

  return (
    <div style={{ paddingBottom: 30 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px 4px' }}>
        {/* Confirmación antes de salir: es el elemento más grande de la
            cabecera y un toque accidental no debe tirar la sesión. */}
        <button
          onClick={() => setConfirmandoSalir(true)}
          title="Cerrar sesión"
          style={{
            width: 62, height: 62, borderRadius: '50%', background: vendedor.color, display: 'flex',
            alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 22,
            boxShadow: '0 6px 16px rgba(34,189,120,.32)', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >{vendedor.iniciales}</button>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#bcd9c9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1f4d39" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
        </div>
      </div>

      <div style={{ padding: '6px 20px 0' }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-.5px' }}>Hola, {primerNombre}</h1>
        <p style={{ margin: '6px 0 0', fontSize: 15, color: 'var(--ink-300)', fontWeight: 500, lineHeight: 1.4 }}>Este es tu avance de hoy.</p>
      </div>

      <button
        onClick={() => navigate('/visitas')}
        style={{
          margin: '18px 16px 0', width: 'calc(100% - 32px)', display: 'flex', alignItems: 'center', gap: 14,
          background: 'var(--aviva-green-700)', borderRadius: 22, padding: '18px 18px', border: 'none',
          boxShadow: '0 10px 26px rgba(15,81,50,.28)', textAlign: 'left',
        }}
      >
        <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(255,255,255,.16)', flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', lineHeight: 1.1 }}>{porVisitar} {porVisitar === 1 ? 'negocio' : 'negocios'} por visitar</div>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#bfe6cf', marginTop: 3 }}>Toca para ver tu lista y registrar una visita</div>
        </div>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <div style={{ margin: '16px 16px 0', background: '#fff', borderRadius: 26, padding: '18px 16px 16px', boxShadow: '0 8px 28px rgba(20,60,40,.07)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '0 4px 14px' }}>
          <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1px', color: '#8b938b' }}>MI AVANCE HOY</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--aviva-orange-100)', padding: '5px 10px', borderRadius: 20 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--aviva-orange-500)" stroke="none"><path d="M12 2c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-.5-3 2 2 3.5 4.5 3.5 8a8 8 0 0 1-16 0c0-3 1.5-5.5 4-8 0 2 1 3 2 3.5C12.5 8 11 5 12 2Z"/></svg>
            <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--aviva-orange-600)' }}>{metas?.racha ?? 0} {metas?.racha === 1 ? 'día' : 'días'} en racha</span>
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

      {confirmandoSalir && (
        <div
          onClick={() => setConfirmandoSalir(false)}
          style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(10,25,17,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 28 }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 320, background: '#fff', borderRadius: 22, padding: '22px 20px', boxShadow: '0 18px 44px rgba(10,25,17,.3)', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--ink-900)' }}>¿Cerrar sesión?</div>
            <p style={{ margin: '8px 0 0', fontSize: 13.5, fontWeight: 500, color: 'var(--ink-300)', lineHeight: 1.5 }}>
              Tendrás que volver a iniciar sesión para registrar visitas.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button
                onClick={() => setConfirmandoSalir(false)}
                style={{ flex: 1, border: '1.5px solid #e4e6e2', background: '#f7f8f6', color: 'var(--ink-600)', borderRadius: 14, padding: 13, fontSize: 14, fontWeight: 700 }}
              >
                Cancelar
              </button>
              <button
                onClick={salir}
                style={{ flex: 1, border: 'none', background: '#c0392b', color: '#fff', borderRadius: 14, padding: 13, fontSize: 14, fontWeight: 700 }}
              >
                Cerrar sesión
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

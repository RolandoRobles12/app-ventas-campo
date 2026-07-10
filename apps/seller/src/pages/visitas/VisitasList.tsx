import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type Prospecto } from '../../api';
import { useSession } from '../../session';

const pinIcon = (color: string) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
);

export function VisitasList() {
  const { vendedor } = useSession();
  const navigate = useNavigate();
  const [prospectos, setProspectos] = useState<Prospecto[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = () => {
    if (!vendedor) return;
    api.prospectos(vendedor.id).then(setProspectos).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(reload, [vendedor]);

  if (!vendedor) return null;

  const porVisitar = prospectos.filter((p) => p.estado === 'por_visitar');
  const visitados = prospectos.filter((p) => p.estado === 'visitado');

  return (
    <div style={{ padding: '0 0 20px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '18px 20px 0' }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1.2px', color: 'var(--ink-100)' }}>
            {new Date().toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }).toUpperCase()}
          </div>
          <h1 style={{ margin: '5px 0 0', fontSize: 29, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-.5px' }}>Visitas de campo</h1>
        </div>
        <div style={{ width: 46, height: 46, borderRadius: '50%', background: vendedor.color, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800, fontSize: 16, boxShadow: '0 6px 16px rgba(34,189,120,.3)' }}>{vendedor.iniciales}</div>
      </div>

      <div style={{ display: 'flex', gap: 10, padding: '16px 16px 0' }}>
        <div style={{ flex: 1, background: 'var(--aviva-green-700)', borderRadius: 20, padding: '15px 16px', boxShadow: '0 8px 20px rgba(15,81,50,.22)' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: '#fff', lineHeight: 1 }}>{porVisitar.length}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: '#9fceb4', marginTop: 5 }}>Por visitar hoy</div>
        </div>
        <div style={{ flex: 1, background: '#fff', borderRadius: 20, padding: '15px 16px', boxShadow: '0 8px 20px rgba(20,60,40,.07)' }}>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--ink-900)', lineHeight: 1 }}>{visitados.length}</div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--ink-300)', marginTop: 5 }}>Visitados</div>
        </div>
      </div>

      <button
        onClick={() => navigate('/visitas/nuevo')}
        style={{
          margin: '14px 16px 0', width: 'calc(100% - 32px)', display: 'flex', alignItems: 'center', gap: 11,
          background: '#fff', border: '1.5px dashed #b7cabf', borderRadius: 18, padding: '14px 16px',
        }}
      >
        <div style={{ width: 38, height: 38, borderRadius: 12, background: 'var(--aviva-green-100)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#15915c" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </div>
        <div style={{ textAlign: 'left', flex: 1 }}>
          <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink-800)' }}>Registrar visita nueva</div>
          <div style={{ fontSize: 12, fontWeight: 500, color: '#7a857d', marginTop: 1 }}>Un negocio que no está en tu lista</div>
        </div>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#c3cbc4" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
      </button>

      <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '1px', color: '#8b938b', margin: '20px 20px 10px' }}>LEADS ASIGNADOS</div>

      {loading && <div style={{ padding: '0 20px', color: 'var(--ink-300)', fontSize: 13 }}>Cargando…</div>}
      {!loading && prospectos.length === 0 && (
        <div style={{ padding: '0 20px', color: 'var(--ink-300)', fontSize: 13 }}>No tienes leads asignados todavía.</div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 11, padding: '0 16px' }}>
        {prospectos.map((p) => {
          const isDone = p.estado === 'visitado';
          return (
            <div
              key={p.id}
              onClick={() => navigate(`/visitas/${p.id}`)}
              style={{
                background: '#fff', borderRadius: 20, padding: '15px 16px', boxShadow: '0 6px 18px rgba(20,60,40,.07)',
                display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer',
              }}
            >
              <div style={{ width: 46, height: 46, borderRadius: 14, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isDone ? 'var(--aviva-green-100)' : 'var(--aviva-orange-100)' }}>
                {pinIcon(isDone ? '#22a36c' : '#e07a26')}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 15.5, fontWeight: 700, color: 'var(--ink-800)' }}>{p.nombre}</div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: '#7a857d', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.direccion}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 7 }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20,
                    color: isDone ? '#1c7a4f' : '#c96a1e', background: isDone ? '#dcf1e5' : 'var(--aviva-orange-100)',
                  }}>{isDone ? 'Visitado' : 'Por visitar'}</span>
                  {p.distanciaKm != null && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: 11.5, fontWeight: 600, color: 'var(--ink-100)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#9aa39c" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/></svg>
                      {p.distanciaKm} km
                    </span>
                  )}
                </div>
              </div>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#c3cbc4" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          );
        })}
      </div>
    </div>
  );
}

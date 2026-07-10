import { useEffect, useState } from 'react';
import { api, type SeguimientoItem } from '../api';
import { useFilters } from '../filters';
import { FilterBar } from '../components/FilterBar';
import { estadoBadgeStyle } from '../badges';

export function Seguimiento() {
  const { fProducto, fVendedor } = useFilters();
  const [items, setItems] = useState<SeguimientoItem[]>([]);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    api.seguimiento(fProducto, fVendedor).then(setItems).catch(() => {});
    const interval = setInterval(() => {
      setTick((t) => t + 1);
      api.seguimiento(fProducto, fVendedor).then(setItems).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, [fProducto, fVendedor]);

  return (
    <div className="screen">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 46, height: 46, borderRadius: '50%', background: '#e6f2ea', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></svg>
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: 27, fontWeight: 500, color: '#263238' }}>Seguimiento en vivo</h1>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#6f7d75', marginTop: 2 }}>Vendedores en ruta ahora mismo</div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#e9f7ef', border: '1px solid #bfe6cf', borderRadius: 20, padding: '7px 14px' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: '#22a36c', boxShadow: '0 0 0 4px rgba(34,163,108,.18)' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: '#0f5132' }}>Actualiza cada 15s{tick > 0 ? ` · última hace ${tick * 15}s` : ''}</span>
        </div>
      </div>
      <FilterBar />

      {items.length === 0 && (
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: 24, textAlign: 'center', color: '#8a978f', fontSize: 13 }}>
          Ningún vendedor ha iniciado su jornada todavía en este filtro.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {items.map((t) => (
          <div key={t.id} style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '18px 20px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 15 }}>
              <span style={{ width: 42, height: 42, borderRadius: '50%', background: t.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 600 }}>{t.iniciales}</span>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#263238' }}>{t.nombre}</div>
                <div style={{ fontSize: 12.5, color: '#8a978f' }}>{t.producto} · {t.ciudad} · inició {t.inicio || '--:--'}</div>
              </div>
              <span style={estadoBadgeStyle(t.estado)}>{t.estado}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
              <Stat label="Realizadas" value={t.realizadas} />
              <Stat label="Pendientes" value={t.pendientes} />
              <Stat label="km recorridos" value={t.km} />
            </div>
            <div style={{ height: 8, borderRadius: 6, background: '#eef2ee', overflow: 'hidden', marginBottom: 6 }}>
              <div style={{ height: '100%', width: `${t.pct}%`, background: t.color, borderRadius: 6 }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11.5, color: '#8a978f' }}>
              <span>Progreso de la lista</span><span>{t.pct}%</span>
            </div>
            <div style={{ marginTop: 13, paddingTop: 13, borderTop: '1px solid #f2f5f2', display: 'flex', alignItems: 'center', gap: 9 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ef8b3e" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
              <span style={{ fontSize: 12.5, color: '#5a665f' }}>Última visita: <b style={{ color: '#263238' }}>{t.ubicacionActual}</b></span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ flex: 1, background: '#f4f9f5', borderRadius: 8, padding: '10px 12px' }}>
      <div style={{ fontSize: 20, fontWeight: 600, color: '#263238' }}>{value}</div>
      <div style={{ fontSize: 11.5, color: '#8a978f' }}>{label}</div>
    </div>
  );
}

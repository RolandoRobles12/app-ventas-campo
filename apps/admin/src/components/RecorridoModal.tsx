import { useEffect, useState } from 'react';
import { api } from '../api';
import { GeoMap, type Recorrido } from './GeoMap';

export function RecorridoModal({ vendedorId, nombre, onClose }: { vendedorId: string; nombre: string; onClose: () => void }) {
  const [ruta, setRuta] = useState<Recorrido | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.recorridos({ vendedorIds: [vendedorId] })
      .then((r) => setRuta(r[0] ?? { vendedorId, nombre, color: '#2a6fdb', puntos: [] }))
      .catch((err) => setError(err.message || 'No se pudo cargar el recorrido'));
  }, [vendedorId, nombre]);

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,40,30,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.28)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 600, color: '#263238' }}>Recorrido de hoy · {nombre}</div>
            <div style={{ fontSize: 12.5, color: '#8a978f', marginTop: 2 }}>
              {ruta == null ? 'Cargando…' : `${ruta.puntos.length} puntos GPS registrados`}
            </div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, border: 'none', background: '#f4f6f2', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3a4a41" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>
        <div style={{ position: 'relative', zIndex: 0, height: 420, background: '#e7ece4' }}>
          <GeoMap recorridos={ruta ? [ruta] : []} height={420} />
          {ruta && ruta.puntos.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.72)', color: '#5a665f', fontSize: 12.5, fontWeight: 600, textAlign: 'center', padding: '0 30px' }}>
              {error || 'Aún no hay puntos GPS de hoy. Se registran cada ~5 minutos mientras el vendedor tiene la app abierta.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

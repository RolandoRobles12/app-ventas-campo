import { useEffect, useState } from 'react';
import { api } from '../api';
import { GeoMap, type Recorrido } from './GeoMap';

interface RecorridoModalProps {
  vendedorId: string;
  nombre: string;
  // Rango de fecha activo en los filtros de la página que abre el modal
  // (Seguimiento). Sin esto, el modal ignoraba el filtro de fecha elegido y
  // siempre mostraba el recorrido de hoy, aunque el usuario tuviera "Ayer"
  // o cualquier otro rango seleccionado.
  desde?: string | null;
  hasta?: string | null;
  // Etiqueta legible del rango ("Ayer", "Esta semana"...); null/undefined
  // cuando no hay filtro de fecha activo, que es cuando el backend recorre
  // por default el día de hoy.
  rangoLabel?: string | null;
  onClose: () => void;
}

export function RecorridoModal({ vendedorId, nombre, desde, hasta, rangoLabel, onClose }: RecorridoModalProps) {
  const [ruta, setRuta] = useState<Recorrido | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    setRuta(null);
    api.recorridos({ vendedorIds: [vendedorId], desde: desde ?? undefined, hasta: hasta ?? undefined })
      .then((r) => setRuta(r[0] ?? { vendedorId, nombre, color: '#2a6fdb', puntos: [] }))
      .catch((err) => setError(err.message || 'No se pudo cargar el recorrido'));
  }, [vendedorId, nombre, desde, hasta]);

  const titulo = rangoLabel ? `Recorrido · ${rangoLabel} · ${nombre}` : `Recorrido de hoy · ${nombre}`;
  const sinPuntosMensaje = rangoLabel
    ? `Aún no hay puntos GPS registrados en el rango "${rangoLabel}".`
    : 'Aún no hay puntos GPS de hoy. Se registran cada ~5 minutos mientras el vendedor tiene la app abierta.';

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,40,30,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 640, background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.28)', overflow: 'hidden' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16.5, fontWeight: 600, color: '#263238' }}>{titulo}</div>
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
              {error || sinPuntosMensaje}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

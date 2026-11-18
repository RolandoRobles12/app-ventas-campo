import { useCallback, useEffect, useState } from 'react';
import { api, type EstadoSolicitudes, type OpcionSolicitud } from '../api';
import { useEnLinea } from '../offline';
import { IconCheck, IconRecargar } from '../icons';

// "Hizo solicitud": cuál de sus solicitudes de HubSpot es la de este negocio.
// Valor: el id del deal, 'pendiente' ("todavía no aparece") o null (sin
// elegir). Si HubSpot no responde o no hay señal, queda 'pendiente' solo: la
// visita nunca se detiene por esto (se liga después, ver server/src/solicitudes.ts).
export const PENDIENTE = 'pendiente';

const hora = (ms: number) => new Date(ms).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });

export function SelectorSolicitud({ vendedorId, visitaId, valor, onChange }: {
  vendedorId: string;
  // Al ligar una visita ya guardada: se buscan las de ese día en adelante.
  visitaId?: string;
  valor: string | null;
  onChange: (v: string | null) => void;
}) {
  const enLinea = useEnLinea();
  const [estado, setEstado] = useState<EstadoSolicitudes | 'cargando'>('cargando');
  const [items, setItems] = useState<OpcionSolicitud[]>([]);
  const [actualizando, setActualizando] = useState(false);

  const cargar = useCallback((fresco: boolean) => {
    if (!navigator.onLine) { setEstado('error'); return Promise.resolve(); }
    if (fresco) setActualizando(true);
    return api.solicitudesParaLigar(vendedorId, { visitaId, fresco })
      .then((r) => { setEstado(r.estado); setItems(r.items); })
      .catch(() => setEstado('error'))
      .finally(() => setActualizando(false));
  }, [vendedorId, visitaId]);
  useEffect(() => { cargar(false); }, [cargar]);

  // Sin lista (sin señal, HubSpot caído, sin cuenta), "todavía no aparece" es
  // la única opción: se elige sola para no trabar el registro.
  const sinLista = estado !== 'ok' && estado !== 'cargando';
  useEffect(() => { if (sinLista && valor !== PENDIENTE && !visitaId) onChange(PENDIENTE); }, [sinLista]); // eslint-disable-line react-hooks/exhaustive-deps

  const libres = items.filter((s) => !s.ligadaA || s.ligadaA.visitaId === visitaId);
  const ocupadas = items.filter((s) => s.ligadaA && s.ligadaA.visitaId !== visitaId);

  return (
    <div className="aparecer" style={{ marginTop: 16, background: '#f2f8f4', borderRadius: 16, padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, fontSize: 15, fontWeight: 800, color: '#15703f' }}>¿Cuál es su solicitud en HubSpot?</div>
        {estado === 'ok' && (
          <button className="tap" onClick={() => cargar(true)} disabled={actualizando} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: 800, color: 'var(--aviva-green-700)', padding: '6px 8px' }}>
            <span className={actualizando ? 'girando' : undefined} style={{ display: 'flex' }}><IconRecargar size={16} /></span> Actualizar
          </button>
        )}
      </div>

      {estado === 'cargando' && <div style={{ fontSize: 14, fontWeight: 600, color: '#5a665f', marginTop: 8 }}>Buscando tus solicitudes de hoy…</div>}

      {sinLista && (
        <div style={{ fontSize: 14, fontWeight: 600, color: '#5a665f', marginTop: 8, lineHeight: 1.45 }}>
          {!enLinea ? 'Sin señal no podemos ver tus solicitudes.'
            : estado === 'sin_cuenta' ? 'Tu correo no tiene usuario en HubSpot: avísale a tu líder.'
              : estado === 'sin_configurar' ? 'HubSpot no está conectado.'
                : 'No pudimos traer tus solicitudes ahora.'}
          {' '}Guarda la visita: la solicitud se liga después.
          {estado === 'error' && enLinea && (
            <button className="tap" onClick={() => { setEstado('cargando'); cargar(true); }} style={{ display: 'block', marginTop: 6, fontSize: 14, fontWeight: 800, color: 'var(--aviva-green-700)', padding: '6px 0' }}>
              Reintentar
            </button>
          )}
        </div>
      )}

      {estado === 'ok' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 10 }}>
          {libres.map((s, i) => (
            <Opcion key={s.id} activa={valor === s.id} onClick={() => onChange(s.id)}
              titulo={s.nombre} detalle={`Creada a las ${hora(s.creado)}${i === 0 ? ' · la más reciente' : ''}`} />
          ))}
          {!libres.length && (
            <div style={{ fontSize: 14, fontWeight: 600, color: '#5a665f', lineHeight: 1.45 }}>
              Todavía no vemos solicitudes nuevas tuyas{visitaId ? ' desde ese día' : ' de hoy'}. Si la acabas de crear, puede tardar unos segundos: toca "Actualizar".
            </div>
          )}
          {!visitaId && (
            <Opcion
              activa={valor === PENDIENTE} onClick={() => onChange(PENDIENTE)}
              titulo="Todavía no aparece"
              detalle="Guarda la visita y la ligamos después: te la recordamos en Mi ruta y, si aparece, se liga sola."
            />
          )}
          {ocupadas.length > 0 && (
            <div style={{ fontSize: 13, fontWeight: 600, color: '#8a978f', marginTop: 2 }}>
              Ya ligadas a otra visita: {ocupadas.map((s) => `${s.nombre} (${s.ligadaA!.nombreNegocio || 'otra visita'})`).join(' · ')}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Opcion({ activa, onClick, titulo, detalle }: { activa: boolean; onClick: () => void; titulo: string; detalle: string }) {
  return (
    <button
      className="tap" onClick={onClick} aria-pressed={activa}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', width: '100%', borderRadius: 14, padding: '12px 14px',
        background: activa ? '#fff' : '#fbfdfb', border: `2px solid ${activa ? 'var(--aviva-green-700)' : '#d7e6dc'}`,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div className="ellipsis" style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink-800)' }}>{titulo}</div>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#6f7d75', marginTop: 2, lineHeight: 1.35 }}>{detalle}</div>
      </div>
      {activa && <span style={{ color: 'var(--aviva-green-700)', flex: 'none' }}><IconCheck size={22} stroke={3} /></span>}
    </button>
  );
}

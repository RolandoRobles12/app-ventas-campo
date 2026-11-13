import { useState } from 'react';
import { api, type Vendedor, type ZonaPunto, type ZonaRestringida } from '../api';
import { useToast } from '../toast';
import { MultiSelectDropdown } from './MultiSelectDropdown';
import { ROJO_PROHIBIDA } from './PlannerMap';
import { boton } from './ui';
import { centroide, distanciaKm } from '../lib/zonas';

// La zona que se está creando o editando. Sus esquinas se marcan en el mapa
// del planeador (por eso este estado vive en el Planeador).
export interface ZonaEnEdicion {
  id?: string;
  nombre: string;
  motivo: string;
  mostrarMotivo: boolean;
  puntos: ZonaPunto[];
  vendedorIds: string[];
}

// "Donde no puede ir": las zonas restringidas del vendedor, dentro del
// planeador. Se dibujan como las zonas de la ruta, en rojo; una zona se
// puede aplicar a más vendedores al crearla o reutilizar la de otro.
export function ZonasProhibidas({
  vendedor, vendedores, zonas, recargar, editando, setEditando, eligiendo, setEligiendo, referencia, onCambio,
}: {
  vendedor: Vendedor;
  vendedores: Vendedor[];
  zonas: ZonaRestringida[];
  recargar: () => Promise<void>;
  editando: ZonaEnEdicion | null;
  setEditando: (z: ZonaEnEdicion | null) => void;
  eligiendo: boolean;
  setEligiendo: (v: boolean) => void;
  // Centro de su ruta: para ordenar por cercanía las zonas de otros.
  referencia: ZonaPunto | null;
  // Algo cambió en sus zonas (para quitar de la vista previa lo que quedó dentro).
  onCambio: () => void;
}) {
  const { showToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const nombreDe = (id: string) => vendedores.find((v) => v.id === id)?.nombre.split(' ')[0] ?? 'otro vendedor';

  const suyas = zonas.filter((z) => z.vendedorIds.includes(vendedor.id));
  const deOtros = zonas.filter((z) => !z.vendedorIds.includes(vendedor.id))
    .map((z) => ({ z, km: referencia && z.puntos.length ? distanciaKm(referencia, centroide(z.puntos)) : null }))
    .sort((a, b) => (a.km ?? Infinity) - (b.km ?? Infinity));
  // Los demás vendedores activos, primero los de su mismo producto.
  const otros = vendedores.filter((v) => v.id !== vendedor.id && v.estado !== 'Baja')
    .sort((a, b) => Number(b.productoId === vendedor.productoId) - Number(a.productoId === vendedor.productoId) || a.nombre.localeCompare(b.nombre));

  const avisar = (texto: string, quitados: number) =>
    showToast(`${texto}${quitados ? ` · se quitaron ${quitados} negocios pendientes que estaban dentro` : ''}`);

  const guardar = async () => {
    if (!editando) return;
    if (editando.puntos.length < 3) return showToast('Marca en el mapa al menos 3 esquinas de la zona.', 'error');
    if (!editando.nombre.trim()) return showToast('Ponle un nombre a la zona.', 'error');
    setGuardando(true);
    try {
      const datos = {
        nombre: editando.nombre.trim(), motivo: editando.motivo.trim() || null,
        mostrarMotivo: !!editando.motivo.trim() && editando.mostrarMotivo,
        puntos: editando.puntos, vendedorIds: editando.vendedorIds,
      };
      const r = editando.id ? await api.editarZonaRestringida(editando.id, datos) : await api.crearZonaRestringida(datos);
      await recargar();
      setEditando(null);
      onCambio();
      avisar(editando.id ? 'Zona actualizada' : 'Zona guardada', r.quitados);
    } catch (err: any) {
      showToast(err.message || 'No se pudo guardar la zona', 'error');
    } finally {
      setGuardando(false);
    }
  };

  const aplicar = async (z: ZonaRestringida) => {
    try {
      const r = await api.editarZonaRestringida(z.id, { vendedorIds: [...z.vendedorIds, vendedor.id] });
      await recargar();
      setEligiendo(false);
      onCambio();
      avisar(`"${z.nombre}" ahora también aplica a ${vendedor.nombre.split(' ')[0]}`, r.quitados);
    } catch (err: any) {
      showToast(err.message || 'No se pudo aplicar la zona', 'error');
    }
  };

  const quitar = async (z: ZonaRestringida) => {
    const compartida = z.vendedorIds.length > 1;
    const pregunta = compartida
      ? `¿Quitar "${z.nombre}" a ${vendedor.nombre}? Los demás vendedores la conservan.`
      : `¿Borrar la zona "${z.nombre}"? ${vendedor.nombre} podrá volver a visitar ahí.`;
    if (!window.confirm(pregunta)) return;
    try {
      await api.editarZonaRestringida(z.id, { vendedorIds: z.vendedorIds.filter((id) => id !== vendedor.id) });
      await recargar();
      showToast(compartida ? 'Zona quitada' : 'Zona borrada');
    } catch (err: any) {
      showToast(err.message || 'No se pudo quitar la zona', 'error');
    }
  };

  return (
    <div style={{ marginTop: 14, border: '1px solid #f1d4d0', background: '#fffafa', borderRadius: 10, padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${ROJO_PROHIBIDA}`, position: 'relative', flex: 'none' }}>
          <span style={{ position: 'absolute', left: -1, right: -1, top: 6, height: 2, background: ROJO_PROHIBIDA, transform: 'rotate(-45deg)' }} />
        </span>
        <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#7a2a22' }}>Donde no puede ir{suyas.length ? ` (${suyas.length})` : ''}</span>
      </div>

      {suyas.length === 0 && !editando && (
        <div style={{ fontSize: 12, color: '#8a978f', marginTop: 4 }}>Opcional. No se le planean negocios ahí y la app no le deja registrar visitas.</div>
      )}

      {suyas.filter((z) => z.id !== editando?.id).map((z) => {
        const tambien = z.vendedorIds.filter((id) => id !== vendedor.id);
        return (
          <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, fontSize: 12.5 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: ROJO_PROHIBIDA, flex: 'none' }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: '#263238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{z.nombre}</div>
              <div style={{ fontSize: 11.5, color: '#8a978f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {[z.motivo && `${z.motivo}${z.mostrarMotivo ? '' : ' (no lo ve)'}`, tambien.length && `También: ${tambien.map(nombreDe).join(', ')}`].filter(Boolean).join(' · ') || 'Sin motivo'}
              </div>
            </div>
            <button
              style={{ ...boton.suave, padding: '5px 9px', fontSize: 12 }} disabled={!!editando}
              onClick={() => { setEligiendo(false); setEditando({ id: z.id, nombre: z.nombre, motivo: z.motivo ?? '', mostrarMotivo: z.mostrarMotivo, puntos: z.puntos, vendedorIds: z.vendedorIds }); }}
            >Editar</button>
            <button style={{ ...boton.peligro, padding: '5px 9px', fontSize: 12 }} disabled={!!editando} onClick={() => quitar(z)} title={tambien.length ? 'Quitársela a este vendedor' : 'Borrar la zona'}>✕</button>
          </div>
        );
      })}

      {editando ? (
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontSize: 12.5, color: '#3a4a41', lineHeight: 1.5 }}>
            Haz clic en el mapa para marcar las esquinas ({editando.puntos.length} {editando.puntos.length === 1 ? 'marcada' : 'marcadas'}, mínimo 3). Arrastra un punto para ajustarlo.
          </div>
          <input value={editando.nombre} onChange={(e) => setEditando({ ...editando, nombre: e.target.value })} placeholder="Nombre de la zona, p. ej. Col. La Joya" style={input} maxLength={80} />
          <input value={editando.motivo} onChange={(e) => setEditando({ ...editando, motivo: e.target.value })} placeholder="Motivo (opcional), p. ej. Inseguridad" style={input} maxLength={200} />
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, color: editando.motivo.trim() ? '#3a4a41' : '#a7b1aa', cursor: 'pointer' }}>
            <input
              type="checkbox" disabled={!editando.motivo.trim()} checked={!!editando.motivo.trim() && editando.mostrarMotivo}
              onChange={(e) => setEditando({ ...editando, mostrarMotivo: e.target.checked })} style={{ accentColor: '#157347' }}
            />
            Mostrarle el motivo al vendedor
          </label>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#3a4a41', marginBottom: 4 }}>También aplica a</div>
            <MultiSelectDropdown
              label="Vendedores" placeholder="Solo a este vendedor"
              options={otros.map((v) => ({ value: v.id, label: v.nombre, grupo: v.productoId === vendedor.productoId ? undefined : 'Otros productos' }))}
              selected={editando.vendedorIds.filter((id) => id !== vendedor.id)}
              onChange={(ids) => setEditando({ ...editando, vendedorIds: [vendedor.id, ...ids] })}
            />
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button style={boton.suave} disabled={!editando.puntos.length} onClick={() => setEditando({ ...editando, puntos: editando.puntos.slice(0, -1) })}>Deshacer punto</button>
            <span style={{ flex: 1 }} />
            <button style={boton.suave} onClick={() => setEditando(null)}>Cancelar</button>
            <button style={{ ...boton.primario, opacity: guardando ? 0.6 : 1 }} disabled={guardando} onClick={guardar}>{guardando ? 'Guardando…' : 'Guardar zona'}</button>
          </div>
        </div>
      ) : eligiendo ? (
        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, color: '#5a665f', marginBottom: 6 }}>Zonas de otros vendedores, la más cercana primero (en rojo claro en el mapa):</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
            {deOtros.map(({ z, km }) => (
              <div key={z.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, background: '#fff', border: '1px solid #f1e1df', borderRadius: 8, padding: '6px 8px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#263238' }}>{z.nombre}</div>
                  <div style={{ fontSize: 11.5, color: '#8a978f' }}>{[km != null && `a ${km < 10 ? km.toFixed(1) : Math.round(km)} km`, z.vendedorIds.map(nombreDe).join(', ')].filter(Boolean).join(' · ')}</div>
                </div>
                <button style={{ ...boton.secundario, padding: '5px 10px', fontSize: 12 }} onClick={() => aplicar(z)}>Aplicar</button>
              </div>
            ))}
          </div>
          <button style={{ ...boton.suave, marginTop: 8 }} onClick={() => setEligiendo(false)}>Cancelar</button>
        </div>
      ) : (
        <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
          <button style={boton.suave} onClick={() => setEditando({ nombre: '', motivo: '', mostrarMotivo: false, puntos: [], vendedorIds: [vendedor.id] })}>+ Dibujar zona</button>
          {deOtros.length > 0 && <button style={boton.suave} onClick={() => setEligiendo(true)}>Usar una de otro vendedor</button>}
        </div>
      )}
    </div>
  );
}

const input: React.CSSProperties = { border: '1px solid #d9e1db', borderRadius: 7, padding: '8px 10px', fontSize: 12.5, background: '#fff', minWidth: 0 };

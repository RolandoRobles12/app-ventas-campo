import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type EstadoEquipo, type EstadoRuta, type ReporteSync } from '../api';
import { useFilters } from '../filters';
import { useToast } from '../toast';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { MultiSelectDropdown } from '../components/MultiSelectDropdown';
import { Aviso, Avatar, Card, Modal, boton } from '../components/ui';
import { prodBadgeStyle } from '../badges';
import { etiquetaDia, haceCuanto } from '../lib/dateRanges';

const SIN_DATO = '(sin dato)';

// El equipo de campo es exactamente quien está activo en la base de
// colaboradores de aviva-recruiting: aquí se ve la conexión, qué productos
// cuentan como "de campo" y el equipo activo con su ruta. Las bajas no se
// gestionan aquí: quien deja de estar activo allá simplemente deja de
// aparecer (y de poder entrar a la app).
export function Equipo() {
  const { vendedores, fProductos, fVendedores, reload } = useFilters();
  const { showToast } = useToast();
  const [estado, setEstado] = useState<EstadoEquipo | null>(null);
  const [rutas, setRutas] = useState<Map<string, EstadoRuta>>(new Map());
  const [sincronizando, setSincronizando] = useState(false);
  const [busqueda, setBusqueda] = useState('');
  const [fHubs, setFHubs] = useState<string[]>([]);
  const [fZonas, setFZonas] = useState<string[]>([]);
  const [editandoProductos, setEditandoProductos] = useState(false);

  const cargar = () => {
    api.equipo().then(setEstado).catch(() => {});
    api.rutasEstado().then((r) => setRutas(new Map(r.items.map((i) => [i.vendedorId, i])))).catch(() => {});
  };
  useEffect(cargar, []);

  const sincronizar = async (forzar = false) => {
    if (forzar && !window.confirm('La sincronización detectó que mucha gente dejaría de estar activa a la vez. ¿Aplicarla de todos modos?')) return;
    setSincronizando(true);
    try {
      const r = await api.sincronizarEquipo(forzar);
      setEstado((e) => (e ? { ...e, ultimo: r } : e));
      reload();
      cargar();
      if (r.detenido) showToast('La sincronización se detuvo: revisa el aviso', 'error');
      else showToast(`Equipo sincronizado · ${r.altas.length + r.reactivados.length} nuevos activos, ${r.bajas.length} ya no activos`);
    } catch (err: any) {
      showToast(err.message || 'No se pudo sincronizar', 'error');
    } finally {
      setSincronizando(false);
    }
  };

  const activos = useMemo(() => vendedores.filter((v) => v.estado !== 'Baja'), [vendedores]);
  const hubs = useMemo(() => [...new Set(activos.map((v) => v.hubManagerNombre || SIN_DATO))].sort(), [activos]);
  const zonas = useMemo(() => [...new Set(activos.map((v) => v.zona || SIN_DATO))].sort(), [activos]);

  const lista = activos
    .filter((v) => !fProductos.length || fProductos.includes(v.productoId))
    .filter((v) => !fVendedores.length || fVendedores.includes(v.id))
    .filter((v) => !fHubs.length || fHubs.includes(v.hubManagerNombre || SIN_DATO))
    .filter((v) => !fZonas.length || fZonas.includes(v.zona || SIN_DATO))
    .filter((v) => `${v.nombre} ${v.email ?? ''} ${v.zona ?? ''} ${v.tienda ?? ''} ${v.puesto ?? ''}`.toLowerCase().includes(busqueda.toLowerCase()))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  const u = estado?.ultimo;

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        title="Equipo" subtitle="Vendedores de campo activos según la base de colaboradores de Aviva Comercial Hub"
      />

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.3fr) minmax(0, 1fr)', gap: 14, marginBottom: 14 }}>
        <Card
          titulo="Base de colaboradores · aviva-recruiting"
          subtitulo="Se sincroniza sola a las 7:30, 12:30 y 19:30: quien está activo allá es vendedor aquí"
          accion={
            <button style={{ ...boton.primario, opacity: sincronizando || !estado?.configurado ? 0.6 : 1 }} disabled={sincronizando || !estado?.configurado} onClick={() => sincronizar()}>
              {sincronizando ? 'Sincronizando…' : 'Sincronizar ahora'}
            </button>
          }
        >
          {estado && !estado.configurado && (
            <Aviso tono="alerta">Falta configurar <b>RECRUITING_PROJECT_ID</b> en el servidor (y darle acceso de lectura a su base). Mientras tanto la lista de abajo es la que ya existía y no se actualiza.</Aviso>
          )}
          {u?.detenido && (
            <div style={{ marginBottom: 10 }}>
              <Aviso tono="error" accion={<button style={boton.peligro} onClick={() => sincronizar(true)}>Aplicar de todos modos</button>}>{u.detenido}</Aviso>
            </div>
          )}
          {u ? <ReporteVista r={u} /> : estado?.configurado && <div style={{ fontSize: 13, color: '#8a978f' }}>Todavía no se ha sincronizado. Dale a "Sincronizar ahora" para traer al equipo.</div>}
        </Card>

        <Card
          titulo="Productos de campo"
          subtitulo="Los colaboradores activos de estos productos son vendedores aquí"
          accion={<button style={boton.secundario} onClick={() => setEditandoProductos(true)} disabled={!estado}>Editar</button>}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(estado?.productos ?? []).map((p) => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 13, opacity: p.esDeCampo ? 1 : 0.5 }}>
                <span style={{ width: 18, textAlign: 'center', color: p.esDeCampo ? '#157347' : '#9aa39c', fontWeight: 700 }}>{p.esDeCampo ? '✓' : '–'}</span>
                <span style={prodBadgeStyle(p.nombre)}>{p.nombre}</span>
                <span style={{ fontSize: 12, color: '#8a978f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.esDeCampo ? (p.giros.length ? p.giros.join(', ') : 'sin giros definidos') : 'no es de campo'}
                </span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <FilterBar
        sinFechas
        extra={
          <>
            <MultiSelectDropdown label="Hub manager" options={hubs.map((h) => ({ value: h, label: h }))} selected={fHubs} onChange={setFHubs} placeholder="Todos los hub managers" />
            <MultiSelectDropdown label="Zona" options={zonas.map((z) => ({ value: z, label: z }))} selected={fZonas} onChange={setFZonas} placeholder="Todas las zonas" />
          </>
        }
        extraActivo={fHubs.length > 0 || fZonas.length > 0}
        onLimpiarExtra={() => { setFHubs([]); setFZonas([]); }}
      />

      <Card padding={0}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderBottom: '1px solid #eef2ee' }}>
          <span style={{ fontSize: 14.5, fontWeight: 600, color: '#263238' }}>
            {lista.length === activos.length ? `${activos.length} vendedores activos` : `${lista.length} de ${activos.length} vendedores activos`}
          </span>
          <span style={{ flex: 1 }} />
          <input value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar por nombre, correo, zona o tienda…" style={{ border: '1px solid #d9e1db', borderRadius: 8, padding: '8px 12px', fontSize: 13, width: 280 }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '10px 16px', fontSize: 12, fontWeight: 600, color: '#6f7d75', borderBottom: '1px solid #eef2ee' }}>
          <div>Vendedor</div><div>Producto y puesto</div><div>Zona / tienda</div><div>Hub manager</div><div style={{ textAlign: 'right' }}>Pendientes</div><div>Ruta</div>
        </div>
        {lista.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#9aa39c', fontSize: 13 }}>Nadie coincide con estos filtros.</div>}
        {lista.map((v) => {
          const r = rutas.get(v.id);
          return (
            <div key={v.id} className="rowh" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '10px 16px', borderBottom: '1px solid #f2f5f2', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar color={v.color} iniciales={v.iniciales} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#263238' }}>{v.nombre}</div>
                  <div style={{ fontSize: 11.5, color: '#8a978f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.email}</div>
                </div>
              </div>
              <div style={{ minWidth: 0 }}>
                <span style={prodBadgeStyle(v.producto)}>{v.producto}</span>
                <div style={{ fontSize: 11.5, color: '#8a978f', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {v.puesto || (v.fuente === 'recruiting' ? '' : 'Pendiente de sincronizar')}
                </div>
              </div>
              <div style={{ color: '#5a665f', minWidth: 0 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.zona || '—'}</div>
                {v.tienda && <div style={{ fontSize: 11.5, color: '#9aa39c', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.tienda}</div>}
              </div>
              <div style={{ color: '#5a665f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.hubManagerNombre || '—'}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{r?.pendientes ?? 0}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 12, color: r?.hasta ? '#1c7a4f' : '#a8322a', whiteSpace: 'nowrap' }}>
                  {r?.hasta ? `Hasta ${etiquetaDia(r.hasta).toLowerCase()}` : r?.pendientes ? 'Sin fechas' : 'Sin ruta'}
                </span>
                <Link to={`/rutas/${v.id}`} style={{ fontSize: 12.5, fontWeight: 600 }}>{v.rutaConfig ? 'Ajustar' : 'Planear'} →</Link>
              </div>
            </div>
          );
        })}
      </Card>

      {editandoProductos && estado && (
        <EditarProductos estado={estado} onClose={() => setEditandoProductos(false)} onGuardado={(e) => { setEstado(e); reload(); setEditandoProductos(false); showToast('Productos de campo actualizados'); }} />
      )}
    </div>
  );
}

const GRID = 'minmax(220px, 1.6fr) minmax(160px, 1.2fr) minmax(140px, 1.2fr) minmax(120px, 1fr) 80px 190px';

function ReporteVista({ r }: { r: ReporteSync }) {
  const [verDetalle, setVerDetalle] = useState(false);
  return (
    <div>
      <div style={{ fontSize: 12.5, color: '#6f7d75' }}>
        Última sincronización {haceCuanto(r.fecha)} · {r.origen === 'manual' ? `manual${r.actor ? ` (${r.actor})` : ''}` : 'automática'} · {r.totalColaboradores.toLocaleString('es-MX')} colaboradores leídos, {r.enProductosCampo} de productos de campo
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginTop: 12 }}>
        <Cifra etiqueta="Nuevos activos" valor={r.altas.length + r.reactivados.length} color="#1c7a4f" />
        <Cifra etiqueta="Ya no activos" valor={r.bajas.length} color="#6f7d75" />
        <Cifra etiqueta="Datos actualizados" valor={r.actualizados} color="#3a4a41" />
      </div>
      {r.sinColaborador > 0 && (
        <div style={{ fontSize: 12, color: '#8a978f', marginTop: 10 }}>
          {r.sinColaborador === 1 ? '1 vendedor no aparece' : `${r.sinColaborador} vendedores no aparecen`} en la base de colaboradores (altas anteriores a esta integración); se dejan como están.
        </div>
      )}
      {(r.altas.length > 0 || r.bajas.length > 0 || r.reactivados.length > 0) && (
        <button onClick={() => setVerDetalle((x) => !x)} style={{ marginTop: 10, background: 'none', border: 'none', color: '#157347', fontWeight: 600, fontSize: 12.5, cursor: 'pointer', padding: 0 }}>
          {verDetalle ? 'Ocultar quiénes' : 'Ver quiénes'}
        </button>
      )}
      {verDetalle && (
        <div style={{ marginTop: 8, fontSize: 12.5, color: '#3a4a41', lineHeight: 1.6 }}>
          {r.altas.length + r.reactivados.length > 0 && <div><b>Nuevos activos:</b> {[...r.altas.map((a) => `${a.nombre} (${a.producto})`), ...r.reactivados.map((x) => x.nombre)].join(', ')}</div>}
          {r.bajas.length > 0 && <div><b>Ya no activos:</b> {r.bajas.map((b) => b.nombre).join(', ')}</div>}
        </div>
      )}
    </div>
  );
}

function Cifra({ etiqueta, valor, color }: { etiqueta: string; valor: number; color: string }) {
  return (
    <div style={{ background: '#f6f9f7', borderRadius: 9, padding: '9px 12px' }}>
      <div style={{ fontSize: 22, fontWeight: 600, color }}>{valor}</div>
      <div style={{ fontSize: 12, color: '#6f7d75' }}>{etiqueta}</div>
    </div>
  );
}

function EditarProductos({ estado, onClose, onGuardado }: { estado: EstadoEquipo; onClose: () => void; onGuardado: (e: EstadoEquipo) => void }) {
  const [campo, setCampo] = useState(new Set(estado.productos.filter((p) => p.esDeCampo).map((p) => p.nombre)));
  const [giros, setGiros] = useState<Record<string, string[]>>(Object.fromEntries(estado.productos.map((p) => [p.id, p.giros])));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState('');

  const guardar = async () => {
    setGuardando(true);
    try {
      onGuardado(await api.guardarProductosEquipo({ productosCampo: [...campo], giros }));
    } catch (err: any) {
      setError(err.message || 'No se pudo guardar');
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Productos de campo" ancho={640}
      subtitulo="Marca qué productos tienen vendedores de campo y qué giros del DENUE busca cada uno al planear rutas. Los cambios aplican en la siguiente sincronización."
      onClose={onClose}
      pie={<><button style={boton.suave} onClick={onClose}>Cancelar</button><button style={boton.primario} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar'}</button></>}
    >
      {error && <div style={{ marginBottom: 10 }}><Aviso tono="error">{error}</Aviso></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {estado.productos.map((p) => {
          const on = campo.has(p.nombre);
          return (
            <div key={p.id} style={{ border: '1px solid #e6ece7', borderRadius: 10, padding: '10px 12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', fontSize: 13.5, fontWeight: 600 }}>
                <input
                  type="checkbox" checked={on}
                  onChange={() => setCampo((s) => { const n = new Set(s); if (n.has(p.nombre)) n.delete(p.nombre); else n.add(p.nombre); return n; })}
                  style={{ accentColor: '#157347', width: 15, height: 15 }}
                />
                {p.nombre}
              </label>
              {on && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                  {estado.girosDisponibles.map((g) => {
                    const sel = (giros[p.id] ?? []).includes(g);
                    return (
                      <button
                        key={g}
                        onClick={() => setGiros((x) => ({ ...x, [p.id]: sel ? (x[p.id] ?? []).filter((y) => y !== g) : [...(x[p.id] ?? []), g] }))}
                        style={{ border: `1.5px solid ${sel ? '#0f5132' : '#d9e1db'}`, background: sel ? '#0f5132' : '#f8faf8', color: sel ? '#fff' : '#3a4a41', borderRadius: 16, padding: '4px 10px', fontSize: 12, cursor: 'pointer' }}
                      >{g}</button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </Modal>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { api, type EstadoRuta } from '../api';
import { useFilters } from '../filters';
import { useToast } from '../toast';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { Aviso, Avatar, Card, boton } from '../components/ui';
import { prodBadgeStyle } from '../badges';
import { etiquetaDia } from '../lib/dateRanges';

type Filtro = 'todos' | 'sin_ruta' | 'por_vencer' | 'con_ruta';

// Situación de la ruta de cada vendedor, en palabras.
function situacion(e: EstadoRuta | undefined): { filtro: Exclude<Filtro, 'todos'>; texto: string; color: string; fondo: string } {
  if (!e || e.pendientes === 0) return { filtro: 'sin_ruta', texto: 'Sin ruta', color: '#a8322a', fondo: '#fbe3e0' };
  if (e.hasta == null) return { filtro: 'con_ruta', texto: `${e.pendientes} sin fecha`, color: '#5a665f', fondo: '#eef2ee' };
  if (e.diasRestantes != null && e.diasRestantes <= 2) {
    return { filtro: 'por_vencer', texto: e.diasRestantes < 0 ? 'Vencida' : `Hasta ${etiquetaDia(e.hasta).toLowerCase()}`, color: '#94500f', fondo: '#fdecdb' };
  }
  return { filtro: 'con_ruta', texto: `Hasta ${etiquetaDia(e.hasta).toLowerCase()}`, color: '#1c7a4f', fondo: '#dcf1e5' };
}

export function Rutas() {
  const { vendedores, fProductos, fVendedores } = useFilters();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filtro = (params.get('filtro') as Filtro) || 'todos';
  const [estado, setEstado] = useState<Map<string, EstadoRuta>>(new Map());
  const [cargado, setCargado] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const [status, setStatus] = useState<{ denue: boolean; googleMaps: boolean } | null>(null);
  const [busqueda, setBusqueda] = useState('');
  const [seleccion, setSeleccion] = useState<Set<string>>(new Set());
  const [renovando, setRenovando] = useState<{ hechos: number; total: number } | null>(null);

  const cargar = () => {
    api.rutasEstado()
      .then((r) => { setEstado(new Map(r.items.map((i) => [i.vendedorId, i]))); setErrorEstado(''); })
      .catch((err) => setErrorEstado(err.message || 'No se pudo leer el estado de las rutas'))
      .finally(() => setCargado(true));
  };
  useEffect(cargar, []);
  useEffect(() => { api.rutasStatus().then(setStatus).catch(() => {}); }, []);

  const activos = useMemo(() => vendedores
    .filter((v) => v.estado !== 'Baja')
    .filter((v) => (!fProductos.length || fProductos.includes(v.productoId)) && (!fVendedores.length || fVendedores.includes(v.id))), [vendedores, fProductos, fVendedores]);

  const conteo = useMemo(() => {
    const c = { todos: activos.length, sin_ruta: 0, por_vencer: 0, con_ruta: 0 };
    activos.forEach((v) => { c[situacion(estado.get(v.id)).filtro]++; });
    return c;
  }, [activos, estado]);

  const visibles = activos
    .filter((v) => filtro === 'todos' || situacion(estado.get(v.id)).filtro === filtro)
    .filter((v) => v.nombre.toLowerCase().includes(busqueda.toLowerCase()) || (v.zona ?? '').toLowerCase().includes(busqueda.toLowerCase()));

  const renovables = [...seleccion].filter((id) => vendedores.find((v) => v.id === id)?.rutaConfig);

  const renovar = async (ids: string[]) => {
    setRenovando({ hechos: 0, total: ids.length });
    const errores: string[] = [];
    let creados = 0;
    // Uno por uno (no en paralelo): cada renovación consulta el DENUE, que se
    // satura si se le piden muchas zonas a la vez.
    for (const [i, id] of ids.entries()) {
      try {
        creados += (await api.renovarRuta(id)).creados;
      } catch (err: any) {
        errores.push(`${vendedores.find((v) => v.id === id)?.nombre}: ${err.message}`);
      }
      setRenovando({ hechos: i + 1, total: ids.length });
    }
    setRenovando(null);
    setSeleccion(new Set());
    cargar();
    if (errores.length) showToast(`${ids.length - errores.length} rutas renovadas; ${errores.length} con problema — ${errores[0]}`, 'error');
    else showToast(`${ids.length === 1 ? 'Ruta renovada' : `${ids.length} rutas renovadas`} · ${creados} negocios nuevos`);
  };

  const toggle = (id: string) => setSeleccion((s) => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const FILTROS: { k: Filtro; label: string }[] = [
    { k: 'todos', label: 'Todos' }, { k: 'sin_ruta', label: 'Sin ruta' }, { k: 'por_vencer', label: 'Se acaba pronto' }, { k: 'con_ruta', label: 'Con ruta' },
  ];

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>}
        title="Rutas" subtitle="Elige zona, giros y ritmo; la ruta se arma sola, día por día, con negocios reales del DENUE"
      />
      <FilterBar sinFechas />

      {errorEstado && (
        <div style={{ marginBottom: 14 }}><Aviso tono="error">No se pudo leer hasta cuándo tiene ruta cada vendedor ({errorEstado}). Si acabas de desplegar, revisa que los índices de Firestore ya estén creados.</Aviso></div>
      )}
      {status && !status.denue && (
        <div style={{ marginBottom: 14 }}><Aviso tono="alerta">El DENUE no está configurado en el servidor (<b>DENUE_TOKEN</b>): no se pueden generar rutas nuevas hasta configurarlo.</Aviso></div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        {FILTROS.map((f) => {
          const activo = filtro === f.k;
          return (
            <button
              key={f.k}
              onClick={() => setParams(f.k === 'todos' ? {} : { filtro: f.k })}
              style={{
                border: `1.5px solid ${activo ? '#157347' : '#dbe3dd'}`, background: activo ? '#157347' : '#fff', color: activo ? '#fff' : '#3a4a41',
                borderRadius: 20, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {f.label} <span style={{ opacity: 0.75 }}>· {conteo[f.k]}</span>
            </button>
          );
        })}
        <span style={{ flex: 1 }} />
        <input
          value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Buscar vendedor o zona…"
          style={{ border: '1px solid #d9e1db', borderRadius: 8, padding: '9px 12px', fontSize: 13.5, width: 240, background: '#fff' }}
        />
      </div>

      {seleccion.size > 0 && (
        <div style={{ position: 'sticky', top: 0, zIndex: 10, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 12, background: '#0f5132', color: '#fff', borderRadius: 10, padding: '10px 14px' }}>
          <span style={{ fontSize: 13.5, fontWeight: 600 }}>{seleccion.size} seleccionados</span>
          {renovables.length < seleccion.size && (
            <span style={{ fontSize: 12.5, color: '#cfe6d8' }}>· {seleccion.size - renovables.length} sin zona configurada (plánealos primero)</span>
          )}
          <span style={{ flex: 1 }} />
          <button style={{ ...boton.suave, background: 'rgba(255,255,255,.14)', color: '#fff' }} onClick={() => setSeleccion(new Set())}>Quitar selección</button>
          <button
            style={{ ...boton.primario, background: '#fff', color: '#0f5132', opacity: renovando || !renovables.length ? 0.6 : 1 }}
            disabled={!!renovando || !renovables.length}
            onClick={() => renovar(renovables)}
          >
            {renovando ? `Renovando ${renovando.hechos}/${renovando.total}…` : `Renovar ${renovables.length} ${renovables.length === 1 ? 'ruta' : 'rutas'}`}
          </button>
        </div>
      )}

      <Card padding={0}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, padding: '12px 18px', fontSize: 12, fontWeight: 600, color: '#6f7d75', borderBottom: '1px solid #eef2ee', alignItems: 'center' }}>
          <input
            type="checkbox" aria-label="Seleccionar todos"
            checked={visibles.length > 0 && visibles.every((v) => seleccion.has(v.id))}
            onChange={(e) => setSeleccion(e.target.checked ? new Set(visibles.map((v) => v.id)) : new Set())}
            style={{ accentColor: '#157347', width: 15, height: 15 }}
          />
          <div>Vendedor</div><div>Zona de su ruta</div><div style={{ textAlign: 'right' }}>Hoy</div><div style={{ textAlign: 'right' }}>Pendientes</div><div>Ruta</div><div />
        </div>
        {!cargado && <div style={{ padding: 26, textAlign: 'center', color: '#8a978f', fontSize: 13 }}>Cargando rutas…</div>}
        {cargado && visibles.length === 0 && <div style={{ padding: 26, textAlign: 'center', color: '#9aa39c', fontSize: 13 }}>Ningún vendedor en este filtro.</div>}
        {cargado && visibles.map((v) => {
          const e = estado.get(v.id);
          const s = situacion(e);
          return (
            <div key={v.id} className="rowh" style={{ display: 'grid', gridTemplateColumns: GRID, gap: 12, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid #f2f5f2', fontSize: 13 }}>
              <input type="checkbox" checked={seleccion.has(v.id)} onChange={() => toggle(v.id)} aria-label={`Seleccionar a ${v.nombre}`} style={{ accentColor: '#157347', width: 15, height: 15 }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar color={v.color} iniciales={v.iniciales} />
                <div style={{ minWidth: 0 }}>
                  <Link to={`/rutas/${v.id}`} style={{ fontWeight: 600, color: '#263238' }}>{v.nombre}</Link>
                  <div><span style={prodBadgeStyle(v.producto)}>{v.producto}</span></div>
                </div>
              </div>
              <div style={{ color: '#5a665f', minWidth: 0 }}>
                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.rutaConfig?.zona.etiqueta || v.zona || '—'}</div>
                {v.rutaConfig && <div style={{ fontSize: 11.5, color: '#9aa39c' }}>{v.rutaConfig.visitasPorDia} visitas/día · {v.rutaConfig.giros.length} giros</div>}
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{e?.hoy ?? 0}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <b>{e?.pendientes ?? 0}</b>
                {e?.atrasadas ? <div style={{ fontSize: 11.5, color: '#a8322a' }}>{e.atrasadas} atrasadas</div> : null}
              </div>
              <div><span style={{ fontSize: 12, fontWeight: 600, padding: '4px 10px', borderRadius: 20, color: s.color, background: s.fondo, whiteSpace: 'nowrap' }}>{s.texto}</span></div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                {v.rutaConfig && (
                  <button style={boton.suave} disabled={!!renovando} onClick={() => renovar([v.id])} title="Agrega el siguiente periodo con la misma zona, giros y ritmo">Renovar</button>
                )}
                <button style={boton.secundario} onClick={() => navigate(`/rutas/${v.id}`)}>{v.rutaConfig ? 'Ajustar' : 'Planear'}</button>
              </div>
            </div>
          );
        })}
      </Card>
    </div>
  );
}

const GRID = '20px minmax(200px, 1.6fr) minmax(160px, 1.4fr) 50px 90px 150px 190px';

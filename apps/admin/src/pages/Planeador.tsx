import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, type EstadoRuta, type ItemRuta, type Prospecto, type RutaConfig, type RutaGenerada, type Vendedor, type ZonaRestringida } from '../api';
import { useFilters } from '../filters';
import { useToast } from '../toast';
import { PlaceAutocompleteInput } from '../components/PlaceAutocompleteInput';
import { PlannerMap, ROJO_PROHIBIDA, ZONA_COLORES, type LatLng } from '../components/PlannerMap';
import { ZonasProhibidas, type ZonaEnEdicion } from '../components/ZonasProhibidas';
import { centroide, dentroDeAlguna } from '../lib/zonas';
import { Aviso, Avatar, boton } from '../components/ui';
import { prodBadgeStyle } from '../badges';
import { diaSemana, etiquetaDia, sumarDias, toISODate } from '../lib/dateRanges';

// Planeador de la ruta de un vendedor: tres decisiones (zona, giros, ritmo)
// y un botón. El servidor busca los negocios en el DENUE, los ordena en un
// recorrido corto y los reparte por día; aquí solo se revisa y se publica.
// La zona puede juntar varias zonas vecinas, y aparte se marcan las zonas
// donde el vendedor no puede ir.

const DIAS_SEMANA = [
  { v: 1, l: 'L' }, { v: 2, l: 'M' }, { v: 3, l: 'M' }, { v: 4, l: 'J' }, { v: 5, l: 'V' }, { v: 6, l: 'S' }, { v: 0, l: 'D' },
];
const NOMBRE_DIA = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const DURACIONES = [{ v: 1, l: '1 semana' }, { v: 2, l: '2 semanas' }, { v: 3, l: '3 semanas' }, { v: 4, l: '1 mes' }];

function fechasDeTrabajo(inicio: string, semanas: number, dias: number[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < semanas * 7; i++) {
    const f = sumarDias(inicio, i);
    if (dias.includes(diaSemana(f))) out.push(f);
  }
  return out;
}

function siguienteDiaDeTrabajo(desde: string, dias: number[]): string {
  let f = desde;
  for (let i = 0; i < 7 && !dias.includes(diaSemana(f)); i++) f = sumarDias(f, 1);
  return f;
}

const textoRadio = (m: number) => (m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`);
const MAX_ZONAS = 4;

// Una zona de la ruta: círculo (buscador o clic + radio) o contorno dibujado
// (poligono != null, aunque esté vacío mientras se marcan las esquinas).
interface Area {
  etiqueta: string;
  centro: LatLng | null;
  radio: number;
  poligono: LatLng[] | null;
}
const areaVacia = (dibujada = false, radio = 2000): Area => ({ etiqueta: '', centro: null, radio, poligono: dibujada ? [] : null });
const areaLista = (a: Area) => (a.poligono ? a.poligono.length >= 3 : !!a.centro || !!a.etiqueta.trim());

interface Config {
  zonas: Area[];
  giros: string[];
  visitasPorDia: number;
  propiosPorDia: number;
  dias: number[];
  semanas: number;
  inicio: string;
  reemplazar: boolean;
}

function configInicial(v: Vendedor, girosProducto: string[], estado: EstadoRuta | undefined): Config {
  const rc = v.rutaConfig;
  const dias = rc?.dias ?? [1, 2, 3, 4, 5, 6];
  const hoy = toISODate(new Date());
  const inicio = siguienteDiaDeTrabajo(estado?.hasta && estado.hasta >= hoy ? sumarDias(estado.hasta, 1) : hoy, dias);
  const girosPrevios = (rc?.giros ?? v.giros).filter(Boolean);
  const anteriores = v.rutaAnterior?.poligonos?.filter((p) => p.length >= 3) ?? [];
  const zonas: Area[] = rc?.zonas.length
    ? rc.zonas.map((z) => ({ etiqueta: z.etiqueta, centro: z.lat != null && z.lng != null ? { lat: z.lat, lng: z.lng } : null, radio: z.radioMetros, poligono: z.poligono }))
    : anteriores.length
      ? anteriores.map((p, i) => ({ ...areaVacia(true), etiqueta: i === 0 ? v.rutaAnterior?.etiqueta ?? '' : '', poligono: p }))
      : [{ ...areaVacia(), etiqueta: v.rutaAnterior?.etiqueta ?? '' }];
  return {
    zonas,
    giros: girosPrevios.length ? girosPrevios : girosProducto,
    visitasPorDia: rc?.visitasPorDia ?? 10,
    propiosPorDia: rc?.propiosPorDia ?? 0,
    dias,
    semanas: rc?.semanas ?? 1,
    inicio,
    reemplazar: false,
  };
}

function aRutaConfig(c: Config): RutaConfig {
  return {
    zonas: c.zonas.filter(areaLista).map((a) => ({
      etiqueta: a.etiqueta.trim(), lat: a.poligono ? null : a.centro?.lat ?? null, lng: a.poligono ? null : a.centro?.lng ?? null,
      radioMetros: a.radio, poligono: a.poligono,
    })),
    giros: c.giros, visitasPorDia: c.visitasPorDia, propiosPorDia: c.propiosPorDia, dias: c.dias, semanas: c.semanas,
  };
}

export function Planeador() {
  const { vendedorId } = useParams();
  const navigate = useNavigate();
  const { productos, vendedores, reload } = useFilters();
  const { showToast } = useToast();

  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [estado, setEstado] = useState<EstadoRuta | undefined>();
  const [pendientes, setPendientes] = useState<Prospecto[]>([]);
  const [girosDisponibles, setGirosDisponibles] = useState<string[]>([]);
  const [status, setStatus] = useState<{ denue: boolean; googleMaps: boolean } | null>(null);
  const [c, setC] = useState<Config | null>(null);
  const [areaActiva, setAreaActiva] = useState(0);
  const [verMasGiros, setVerMasGiros] = useState(false);
  const [zonasR, setZonasR] = useState<ZonaRestringida[]>([]);
  const [editandoR, setEditandoR] = useState<ZonaEnEdicion | null>(null);
  const [eligiendoR, setEligiendoR] = useState(false);

  const [generando, setGenerando] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<(RutaGenerada & { configUsada: string }) | null>(null);
  const [items, setItems] = useState<ItemRuta[]>([]);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [encuadrar, setEncuadrar] = useState(0);
  const [publicando, setPublicando] = useState(false);
  const [manual, setManual] = useState({ nombre: '', direccion: '', fecha: '' });
  const refPreview = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!vendedorId) return;
    Promise.all([
      api.vendedor(vendedorId),
      api.rutasEstado({ vendedorIds: [vendedorId] }).then((r) => r.items[0]).catch(() => undefined),
      api.prospectos(vendedorId).then((l) => l.filter((p) => p.estado === 'por_visitar')).catch(() => [] as Prospecto[]),
    ]).then(([v, e, p]) => {
      setVendedor(v);
      setEstado(e);
      setPendientes(p);
    }).catch((err) => setError(err.message || 'No se pudo cargar el vendedor'));
    api.equipo().then((e) => setGirosDisponibles(e.girosDisponibles)).catch(() => {});
    api.rutasStatus().then(setStatus).catch(() => {});
    recargarZonasR();
  }, [vendedorId]); // eslint-disable-line react-hooks/exhaustive-deps

  const recargarZonasR = () => api.zonasRestringidas().then(setZonasR).catch(() => {});
  const suyasR = useMemo(() => zonasR.filter((z) => vendedorId && z.vendedorIds.includes(vendedorId)), [zonasR, vendedorId]);
  // Una zona restringida nueva quita (en el servidor) los pendientes que
  // quedaron dentro; aquí se quitan también de la vista previa y del mapa.
  const alCambiarZonasR = () => {
    if (!vendedorId) return;
    api.prospectos(vendedorId).then((l) => setPendientes(l.filter((p) => p.estado === 'por_visitar'))).catch(() => {});
    api.zonasRestringidas().then((todas) => {
      const fuera = todas.filter((z) => z.vendedorIds.includes(vendedorId)).map((z) => z.puntos);
      setItems((prev) => {
        const quedan = prev.filter((i) => !dentroDeAlguna(i, fuera));
        if (quedan.length === prev.length) return prev;
        // Se renumeran las paradas de cada día.
        const porDia = new Map<string, number>();
        return quedan.sort((a, b) => a.fechaPlan.localeCompare(b.fechaPlan) || a.orden - b.orden)
          .map((i) => { const n = (porDia.get(i.fechaPlan) ?? 0) + 1; porDia.set(i.fechaPlan, n); return { ...i, orden: n }; });
      });
    }).catch(() => {});
  };

  const producto = productos.find((p) => p.id === vendedor?.productoId);
  const girosProducto = producto?.giros ?? [];

  useEffect(() => {
    if (vendedor && !c) {
      setC(configInicial(vendedor, girosProducto, estado));
      setEncuadrar((n) => n + 1);
    }
  }, [vendedor, estado]); // eslint-disable-line react-hooks/exhaustive-deps

  // Si el catálogo de productos llegó después que el vendedor, se preseleccionan
  // los giros de su producto.
  useEffect(() => {
    if (c && !c.giros.length && girosProducto.length) setC({ ...c, giros: girosProducto });
  }, [girosProducto.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const fechas = useMemo(() => (c ? fechasDeTrabajo(c.inicio, c.semanas, c.dias) : []), [c]);
  const configActual = c ? JSON.stringify({ ...aRutaConfig(c), inicio: c.inicio, reemplazar: c.reemplazar }) : '';
  const desactualizada = !!preview && preview.configUsada !== configActual;

  const existentes = useMemo(() => (c?.reemplazar ? [] : pendientes)
    .filter((p) => p.lat != null && p.lng != null)
    .map((p) => ({ lat: p.lat!, lng: p.lng!, nombre: p.nombre })), [pendientes, c?.reemplazar]);
  const puntosPreview = useMemo(() => items.filter((i) => i.lat != null && i.lng != null)
    .map((i) => ({ lat: i.lat!, lng: i.lng!, nombre: i.nombre, fechaPlan: i.fechaPlan, orden: i.orden })), [items]);
  const porDia = useMemo(() => {
    const m = new Map<string, ItemRuta[]>();
    for (const f of preview?.fechas ?? []) m.set(f, []);
    for (const i of items) m.set(i.fechaPlan, [...(m.get(i.fechaPlan) ?? []), i]);
    return [...m.entries()].map(([f, l]) => [f, l.sort((a, b) => a.orden - b.orden)] as const);
  }, [items, preview]);

  if (error && !vendedor) return <Aviso tono="error">{error}</Aviso>;
  if (!vendedor || !c) return <div style={{ padding: 30, color: '#8a978f' }}>Cargando planeador…</div>;

  const set = (patch: Partial<Config>) => setC((prev) => (prev ? { ...prev, ...patch } : prev));
  const setArea = (i: number, cambio: Partial<Area>) => setC((prev) => (prev ? { ...prev, zonas: prev.zonas.map((a, j) => (j === i ? { ...a, ...cambio } : a)) } : prev));
  const agregarArea = (dibujada: boolean) => {
    set({ zonas: [...c.zonas, areaVacia(dibujada, c.zonas[c.zonas.length - 1]?.radio)] });
    setAreaActiva(c.zonas.length);
  };
  const quitarArea = (i: number) => {
    set({ zonas: c.zonas.filter((_, j) => j !== i) });
    setAreaActiva((a) => Math.max(0, a > i ? a - 1 : Math.min(a, c.zonas.length - 2)));
  };
  const zonaLista = c.zonas.some(areaLista);
  const zonasIncompletas = c.zonas.some((a) => a.poligono && a.poligono.length > 0 && a.poligono.length < 3);
  const listo = zonaLista && !zonasIncompletas && c.giros.length > 0 && fechas.length > 0 && !editandoR;
  const deRuta = c.visitasPorDia - c.propiosPorDia;
  const primerCentro = c.zonas.map((a) => a.poligono?.length ? centroide(a.poligono) : a.centro).find(Boolean) ?? null;
  const todosLosGiros = [...new Set([...girosProducto, ...girosDisponibles, ...c.giros])];
  const girosVisibles = verMasGiros ? todosLosGiros : [...new Set([...girosProducto, ...c.giros])];

  const generar = async () => {
    setGenerando(true);
    setError('');
    try {
      const r = await api.generarRuta(vendedor.id, { config: aRutaConfig(c), inicio: c.inicio, reemplazarPendientes: c.reemplazar });
      setPreview({ ...r, configUsada: configActual });
      setItems(r.items);
      setDiaSel(r.fechas[0] ?? null);
      setManual((m) => ({ ...m, fecha: r.fechas[0] ?? '' }));
      setEncuadrar((n) => n + 1);
      setTimeout(() => refPreview.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
      if (!r.items.length) setError('El DENUE no encontró negocios nuevos con esos giros en esa zona. Prueba con un radio más grande, otra zona vecina u otros giros.');
    } catch (err: any) {
      setError(err.message || 'No se pudo generar la ruta');
    } finally {
      setGenerando(false);
    }
  };

  const publicar = async () => {
    if (!preview) return;
    setPublicando(true);
    try {
      const r = await api.publicarRuta(vendedor.id, {
        config: aRutaConfig(c), inicio: c.inicio, items, reemplazarPendientes: c.reemplazar, centros: preview.centros,
      });
      reload();
      showToast(`Ruta de ${vendedor.nombre} publicada · ${r.creados} negocios${r.desde ? ` del ${etiquetaDia(r.desde, false)} al ${etiquetaDia(r.hasta!, false)}` : ''}${r.eliminados ? ` · se quitaron ${r.eliminados} pendientes anteriores` : ''}`);
      navigate('/rutas');
    } catch (err: any) {
      showToast(err.message || 'No se pudo publicar la ruta', 'error');
    } finally {
      setPublicando(false);
    }
  };

  const quitarItem = (it: ItemRuta) => {
    setItems((prev) => prev.filter((x) => x !== it)
      .map((x) => (x.fechaPlan === it.fechaPlan && x.orden > it.orden ? { ...x, orden: x.orden - 1 } : x)));
  };

  const agregarManual = () => {
    if (!manual.nombre.trim() || !manual.fecha) return;
    const orden = items.filter((i) => i.fechaPlan === manual.fecha).length + 1;
    setItems((prev) => [...prev, { nombre: manual.nombre.trim(), direccion: manual.direccion.trim(), giro: 'Manual', fechaPlan: manual.fecha, orden, manual: true }]);
    setManual((m) => ({ ...m, nombre: '', direccion: '' }));
    setDiaSel(manual.fecha);
  };

  const faltantes = preview ? Math.max(0, preview.necesarios - preview.encontrados) : 0;

  return (
    <div className="screen" style={{ display: 'grid', gridTemplateColumns: '440px minmax(0, 1fr)', gap: 16, height: 'calc(100vh - 112px)', minHeight: 560 }}>
      <aside style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: '#fff', border: '1px solid #e3eae5', borderRadius: 12 }}>
        <div style={{ padding: '14px 18px', borderBottom: '1px solid #eef2ee', display: 'flex', alignItems: 'center', gap: 12 }}>
          <Link to="/rutas" title="Volver a rutas" style={{ width: 32, height: 32, borderRadius: 8, background: '#f2f5f2', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3a4a41" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          </Link>
          <Avatar color={vendedor.color} iniciales={vendedor.iniciales} size={38} />
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#263238' }}>{vendedor.nombre}</div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
              <span style={prodBadgeStyle(vendedor.producto)}>{vendedor.producto}</span>
              <span style={{ fontSize: 12, color: '#8a978f' }}>
                {estado?.pendientes ? `${estado.pendientes} pendientes${estado.hasta ? ` · hasta ${etiquetaDia(estado.hasta)}` : ''}` : 'sin ruta'}
              </span>
            </div>
          </div>
        </div>

        <div className="adm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {status && !status.denue && <Aviso tono="error">El DENUE no está configurado en el servidor (falta DENUE_TOKEN): no se pueden generar rutas.</Aviso>}

          <Paso n={1} titulo={c.zonas.length > 1 ? 'Zonas' : 'Zona'} ok={zonaLista && !zonasIncompletas}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {c.zonas.map((a, i) => {
                const activa = i === areaActiva;
                const color = ZONA_COLORES[i % ZONA_COLORES.length];
                const resumen = a.poligono
                  ? `Zona dibujada · ${a.poligono.length} ${a.poligono.length === 1 ? 'esquina' : 'esquinas'}`
                  : `${a.etiqueta.trim() || (a.centro ? 'Punto en el mapa' : 'Sin elegir')}${a.centro || a.etiqueta.trim() ? ` · ${textoRadio(a.radio)}` : ''}`;
                return (
                  <div
                    key={i} onClick={() => { if (!activa) setAreaActiva(i); }}
                    style={{
                      // Con una sola zona se ve como siempre (sin tarjeta).
                      border: c.zonas.length > 1 || !activa ? `1.5px solid ${activa ? color : '#e3eae5'}` : 'none',
                      borderRadius: 10, padding: c.zonas.length > 1 || !activa ? '9px 11px' : 0, cursor: activa ? 'default' : 'pointer', background: '#fff',
                    }}
                  >
                    {(c.zonas.length > 1 || !activa) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: activa ? 9 : 0 }}>
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flex: 'none' }} />
                        <span style={{ flex: 1, minWidth: 0, fontSize: 12.5, fontWeight: 600, color: '#263238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {activa ? `Zona ${i + 1}` : resumen}
                        </span>
                        {c.zonas.length > 1 && (
                          <button onClick={(e) => { e.stopPropagation(); quitarArea(i); }} title="Quitar esta zona" style={{ width: 22, height: 22, border: 'none', background: '#f4f6f2', borderRadius: 6, cursor: 'pointer', color: '#c0392b', flex: 'none' }}>×</button>
                        )}
                      </div>
                    )}
                    {activa && (a.poligono ? (
                      <div>
                        <div style={{ fontSize: 12.5, color: '#3a4a41', lineHeight: 1.5 }}>
                          Haz clic en el mapa para marcar las esquinas de la zona ({a.poligono.length} {a.poligono.length === 1 ? 'marcada' : 'marcadas'}, mínimo 3). Arrastra un punto para ajustarlo.
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                          <button style={boton.suave} disabled={!a.poligono.length} onClick={() => setArea(i, { poligono: a.poligono!.slice(0, -1) })}>Deshacer punto</button>
                          <button style={boton.suave} onClick={() => setArea(i, { poligono: [] })} disabled={!a.poligono.length}>Borrar esquinas</button>
                          <button style={{ ...boton.suave, marginLeft: 'auto' }} onClick={() => setArea(i, { poligono: null })}>Mejor buscar colonia</button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <PlaceAutocompleteInput
                          value={a.etiqueta}
                          onChange={(t) => setArea(i, { etiqueta: t, centro: null })}
                          onPlaceSelected={(p) => { setArea(i, { etiqueta: p.description, centro: { lat: p.lat, lng: p.lng } }); setEncuadrar((n) => n + 1); }}
                          placeholder={i === 0 ? 'Colonia, C.P., municipio o dirección del kiosco' : 'Colonia vecina, C.P. o municipio'}
                          types={['geocode']}
                        />
                        <div style={{ fontSize: 12, color: '#8a978f', marginTop: 6 }}>
                          Elige una sugerencia de la lista, o haz clic en el mapa para poner el centro.
                          {status && !status.googleMaps && !a.centro && ' (Sin GOOGLE_MAPS_API_KEY en el servidor, el texto solo no basta: usa una sugerencia o el mapa.)'}
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#3a4a41', fontWeight: 600 }}>
                            <span>Radio de búsqueda</span><span>{textoRadio(a.radio)}</span>
                          </div>
                          <input type="range" min={500} max={5000} step={250} value={a.radio} onChange={(e) => setArea(i, { radio: Number(e.target.value) })} style={{ width: '100%', accentColor: '#157347' }} />
                        </div>
                        <button onClick={() => setArea(i, { poligono: [] })} style={{ background: 'none', border: 'none', color: '#157347', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                          ¿Quieres una zona exacta? Dibújala en el mapa
                        </button>
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
            {c.zonas.length < MAX_ZONAS && !editandoR && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12.5, color: '#5a665f' }}>Juntar otra zona vecina:</span>
                <button style={{ ...boton.suave, padding: '6px 10px', fontSize: 12 }} onClick={() => agregarArea(false)}>+ Buscar colonia</button>
                <button style={{ ...boton.suave, padding: '6px 10px', fontSize: 12 }} onClick={() => agregarArea(true)}>+ Dibujar</button>
              </div>
            )}
            <ZonasProhibidas
              vendedor={vendedor} vendedores={vendedores} zonas={zonasR} recargar={recargarZonasR}
              editando={editandoR} setEditando={(z) => { setEditandoR(z); if (z) setEligiendoR(false); }}
              eligiendo={eligiendoR} setEligiendo={setEligiendoR} referencia={primerCentro} onCambio={alCambiarZonasR}
            />
          </Paso>

          <Paso n={2} titulo="Giros a visitar" ok={c.giros.length > 0}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {girosVisibles.map((g) => {
                const on = c.giros.includes(g);
                return (
                  <button
                    key={g}
                    onClick={() => set({ giros: on ? c.giros.filter((x) => x !== g) : [...c.giros, g] })}
                    style={{ border: `1.5px solid ${on ? '#0f5132' : '#d9e1db'}`, background: on ? '#0f5132' : '#f8faf8', color: on ? '#fff' : '#3a4a41', borderRadius: 18, padding: '6px 12px', fontSize: 12.5, fontWeight: 500, cursor: 'pointer' }}
                  >
                    {on ? '✓ ' : ''}{g}
                  </button>
                );
              })}
            </div>
            {todosLosGiros.length > girosVisibles.length || verMasGiros ? (
              <button onClick={() => setVerMasGiros((x) => !x)} style={{ marginTop: 8, background: 'none', border: 'none', color: '#157347', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', padding: 0 }}>
                {verMasGiros ? 'Ver solo los de su producto' : 'Ver más giros'}
              </button>
            ) : null}
          </Paso>

          <Paso n={3} titulo="Ritmo" ok={fechas.length > 0}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <Etiqueta>Visitas por día</Etiqueta>
                <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d9e1db', borderRadius: 8, overflow: 'hidden', width: 'fit-content' }}>
                  <button style={stepper} onClick={() => { const v = Math.max(1, c.visitasPorDia - 1); set({ visitasPorDia: v, propiosPorDia: Math.min(c.propiosPorDia, v - 1) }); }}>−</button>
                  <input type="number" min={1} max={40} value={c.visitasPorDia} onChange={(e) => { const v = Math.max(1, Math.min(40, parseInt(e.target.value, 10) || 1)); set({ visitasPorDia: v, propiosPorDia: Math.min(c.propiosPorDia, v - 1) }); }} style={{ width: 52, border: 'none', textAlign: 'center', fontSize: 15, fontWeight: 600, padding: '8px 0' }} />
                  <button style={stepper} onClick={() => set({ visitasPorDia: Math.min(40, c.visitasPorDia + 1) })}>+</button>
                </div>
              </div>
              <div>
                <Etiqueta>Empieza</Etiqueta>
                <input type="date" value={c.inicio} onChange={(e) => e.target.value && set({ inicio: e.target.value })} style={{ border: '1px solid #d9e1db', borderRadius: 8, padding: '8px 10px', fontSize: 13.5, width: '100%' }} />
              </div>
            </div>
            <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, fontSize: 12.5, color: '#3a4a41', lineHeight: 1.4 }}>
                <b>De ellas, negocios nuevos que encuentre él</b>
                <div style={{ fontSize: 12, color: '#8a978f' }}>{c.propiosPorDia ? `La ruta trae ${deRuta} por día; los otros ${c.propiosPorDia} los registra él en la calle.` : 'Todo lo trae la ruta.'}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', border: '1px solid #d9e1db', borderRadius: 8, overflow: 'hidden', flex: 'none' }}>
                <button style={stepper} onClick={() => set({ propiosPorDia: Math.max(0, c.propiosPorDia - 1) })}>−</button>
                <span style={{ width: 40, textAlign: 'center', fontSize: 15, fontWeight: 600 }}>{c.propiosPorDia}</span>
                <button style={stepper} onClick={() => set({ propiosPorDia: Math.min(c.visitasPorDia - 1, c.propiosPorDia + 1) })}>+</button>
              </div>
            </div>
            <Etiqueta style={{ marginTop: 12 }}>Días de trabajo</Etiqueta>
            <div style={{ display: 'flex', gap: 6 }}>
              {DIAS_SEMANA.map((d) => {
                const on = c.dias.includes(d.v);
                return (
                  <button
                    key={d.v} title={NOMBRE_DIA[d.v]}
                    onClick={() => set({ dias: on ? c.dias.filter((x) => x !== d.v) : [...c.dias, d.v] })}
                    style={{ width: 36, height: 36, borderRadius: '50%', border: `1.5px solid ${on ? '#0f5132' : '#d9e1db'}`, background: on ? '#0f5132' : '#fff', color: on ? '#fff' : '#5a665f', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}
                  >{d.l}</button>
                );
              })}
            </div>
            <Etiqueta style={{ marginTop: 12 }}>Duración</Etiqueta>
            <div style={{ display: 'flex', background: '#f2f5f2', borderRadius: 9, padding: 3 }}>
              {DURACIONES.map((d) => (
                <button
                  key={d.v} onClick={() => set({ semanas: d.v })}
                  style={{ flex: 1, border: 'none', borderRadius: 7, padding: '7px 4px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', background: c.semanas === d.v ? '#fff' : 'transparent', color: c.semanas === d.v ? '#0f5132' : '#6f7d75', boxShadow: c.semanas === d.v ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}
                >{d.l}</button>
              ))}
            </div>
            {fechas.length > 0 && (
              <div style={{ marginTop: 12, background: '#f2f8f4', borderRadius: 9, padding: '10px 12px', fontSize: 13, color: '#2f5f45', lineHeight: 1.5 }}>
                <b>{fechas.length} días de trabajo</b>, del {etiquetaDia(fechas[0], false)} al {etiquetaDia(fechas[fechas.length - 1], false)}: se buscarán <b>{fechas.length * deRuta} negocios</b>
                {c.propiosPorDia ? <>, y él encontrará <b>{fechas.length * c.propiosPorDia} nuevos</b></> : null}.
              </div>
            )}
            {(estado?.pendientes ?? 0) > 0 && (
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', marginTop: 12, fontSize: 13, color: '#3a4a41', cursor: 'pointer', lineHeight: 1.45 }}>
                <input type="checkbox" checked={c.reemplazar} onChange={(e) => set({ reemplazar: e.target.checked })} style={{ accentColor: '#157347', width: 15, height: 15, marginTop: 2 }} />
                <span>
                  Quitar sus <b>{estado!.pendientes} pendientes</b> actuales y empezar de cero.
                  <span style={{ display: 'block', color: '#8a978f', fontSize: 12 }}>{c.reemplazar ? 'Se borran al publicar; pueden volver a salir en la ruta nueva.' : 'Si no, la ruta nueva se suma a lo que ya tiene.'}</span>
                </span>
              </label>
            )}
          </Paso>

          {error && <Aviso tono="error">{error}</Aviso>}

          {preview && (
            <section ref={refPreview}>
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
                <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#0f5132' }}>Vista previa · {items.length} negocios</h3>
                <span style={{ fontSize: 12, color: '#8a978f' }}>Toca un día para verlo en el mapa</span>
              </div>
              {desactualizada && <div style={{ marginBottom: 8 }}><Aviso tono="alerta">Cambiaste la configuración: vuelve a generar para aplicarla.</Aviso></div>}
              {faltantes > 0 && (
                <div style={{ marginBottom: 8 }}>
                  <Aviso tono="alerta">El DENUE encontró {preview.encontrados} de {preview.necesarios} negocios: los últimos días quedan cortos. Amplía el radio, junta otra zona vecina, agrega giros o baja las visitas por día.</Aviso>
                </div>
              )}
              <div style={{ border: '1px solid #e6ece7', borderRadius: 10, overflow: 'hidden' }}>
                {porDia.map(([fecha, lista]) => {
                  const sel = fecha === diaSel;
                  return (
                    <div key={fecha} style={{ borderBottom: '1px solid #f0f3f1' }}>
                      <button
                        onClick={() => setDiaSel(sel ? null : fecha)}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', border: 'none', background: sel ? '#fff6ee' : '#fff', cursor: 'pointer', textAlign: 'left' }}
                      >
                        <span style={{ width: 10, height: 10, borderRadius: '50%', background: sel ? '#e07a26' : '#5fae86', flex: 'none' }} />
                        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: '#263238', textTransform: 'capitalize' }}>{etiquetaDia(fecha, false)}</span>
                        <span style={{ fontSize: 12.5, color: lista.length < deRuta ? '#a8322a' : '#6f7d75' }}>{lista.length} {lista.length === 1 ? 'negocio' : 'negocios'}</span>
                      </button>
                      {sel && lista.map((it) => (
                        <div key={`${it.nombre}::${it.direccion}::${it.orden}`} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px 7px 32px', fontSize: 12.5, background: '#fffcf8' }}>
                          <span style={{ width: 20, fontWeight: 700, color: '#e07a26', textAlign: 'right', flex: 'none' }}>{it.orden}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontWeight: 600, color: '#263238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.nombre}</div>
                            <div style={{ fontSize: 11.5, color: '#8a978f', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.manual ? 'Agregado a mano · ' : ''}{it.giro} · {it.direccion}</div>
                          </div>
                          <button onClick={() => quitarItem(it)} title="Quitar de la ruta" style={{ width: 24, height: 24, border: 'none', background: '#f4f6f2', borderRadius: 6, cursor: 'pointer', color: '#c0392b', flex: 'none' }}>×</button>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                <input value={manual.nombre} onChange={(e) => setManual({ ...manual, nombre: e.target.value })} placeholder="Agregar negocio a mano" style={inputPeq} />
                <input value={manual.direccion} onChange={(e) => setManual({ ...manual, direccion: e.target.value })} placeholder="Dirección" style={inputPeq} />
                <select value={manual.fecha} onChange={(e) => setManual({ ...manual, fecha: e.target.value })} style={{ ...inputPeq }}>
                  {(preview.fechas).map((f) => <option key={f} value={f}>{etiquetaDia(f, false)}</option>)}
                </select>
                <button style={{ ...boton.suave, opacity: manual.nombre.trim() ? 1 : 0.6 }} onClick={agregarManual} disabled={!manual.nombre.trim()}>+ Agregar</button>
              </div>
            </section>
          )}
        </div>

        <div style={{ padding: '12px 18px', borderTop: '1px solid #eef2ee', display: 'flex', gap: 10 }}>
          <button
            style={{ ...(preview ? boton.secundario : boton.primario), flex: 1, opacity: !listo || generando ? 0.6 : 1 }}
            onClick={generar} disabled={!listo || generando || (status ? !status.denue : false)}
          >
            {generando ? 'Buscando negocios…' : preview ? 'Volver a generar' : 'Generar ruta'}
          </button>
          {preview && (
            <button style={{ ...boton.primario, flex: 1.3, opacity: publicando || desactualizada || !items.length ? 0.6 : 1 }} onClick={publicar} disabled={publicando || desactualizada || !items.length}>
              {publicando ? 'Publicando…' : `Publicar · ${items.length} negocios`}
            </button>
          )}
        </div>
      </aside>

      <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', border: '1px solid #e3eae5', background: '#e7ece4', zIndex: 0 }}>
        <PlannerMap
          areas={c.zonas.map((z) => ({ centro: z.centro, radio: z.radio, poligono: z.poligono }))} areaActiva={areaActiva}
          onArea={(i, cambio) => setArea(i, cambio.centro && !c.zonas[i].etiqueta.trim() ? { ...cambio, etiqueta: 'Punto elegido en el mapa' } : cambio)}
          restringidas={[
            ...suyasR.filter((z) => z.id !== editandoR?.id).map((z) => ({ id: z.id, nombre: z.nombre, puntos: z.puntos })),
            ...(eligiendoR ? zonasR.filter((z) => !suyasR.includes(z)).map((z) => ({ id: z.id, nombre: z.nombre, puntos: z.puntos, tenue: true })) : []),
          ]}
          editandoRestringida={editandoR?.puntos ?? null} onEditandoRestringida={(pts) => setEditandoR((z) => (z ? { ...z, puntos: pts } : z))}
          existentes={existentes} preview={puntosPreview} diaSeleccionado={diaSel} onElegirDia={setDiaSel}
          encuadrarToken={encuadrar} alto="100%"
        />
        <div style={{ position: 'absolute', left: 12, bottom: 12, background: '#fff', borderRadius: 9, padding: '9px 12px', boxShadow: '0 2px 8px rgba(0,0,0,.12)', display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12, color: '#3a4a41' }}>
          {existentes.length > 0 && <Leyenda color="#8a978f" texto={`Ya en su ruta (${existentes.length})`} chico />}
          {preview && <Leyenda color="#5fae86" texto="Ruta nueva" chico />}
          {preview && <Leyenda color="#e07a26" texto={diaSel ? `${etiquetaDia(diaSel, false)}, en orden de visita` : 'Elige un día para ver su recorrido'} />}
          {suyasR.length > 0 && <Leyenda color={ROJO_PROHIBIDA} texto="Donde no puede ir" chico />}
          {(!preview || editandoR) && (
            <span style={{ color: editandoR ? ROJO_PROHIBIDA : '#6f7d75', fontWeight: editandoR ? 600 : 400 }}>
              {editandoR ? 'Clic: esquina de la zona donde no puede ir'
                : c.zonas[areaActiva]?.poligono ? `Clic: esquina de la zona${c.zonas.length > 1 ? ` ${areaActiva + 1}` : ''}`
                  : `Clic: centro de la zona${c.zonas.length > 1 ? ` ${areaActiva + 1}` : ''}`}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

const stepper: React.CSSProperties = { width: 34, height: 36, border: 'none', background: '#f2f5f2', fontSize: 18, fontWeight: 600, color: '#0f5132', cursor: 'pointer' };
const inputPeq: React.CSSProperties = { border: '1px solid #d9e1db', borderRadius: 7, padding: '8px 10px', fontSize: 12.5, background: '#fff', minWidth: 0 };

function Paso({ n, titulo, ok, children }: { n: number; titulo: string; ok: boolean; children: React.ReactNode }) {
  return (
    <section>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
        <span style={{ width: 22, height: 22, borderRadius: '50%', background: ok ? '#157347' : '#cdd8d0', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{ok ? '✓' : n}</span>
        <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700, color: '#263238' }}>{titulo}</h3>
      </div>
      {children}
    </section>
  );
}

function Etiqueta({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <div style={{ fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6, ...style }}>{children}</div>;
}

function Leyenda({ color, texto, chico = false }: { color: string; texto: string; chico?: boolean }) {
  return (
    <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
      <span style={{ width: chico ? 8 : 12, height: chico ? 8 : 12, borderRadius: '50%', background: color, border: '2px solid #fff', boxShadow: '0 0 0 1px #d9e1db' }} />
      {texto}
    </span>
  );
}

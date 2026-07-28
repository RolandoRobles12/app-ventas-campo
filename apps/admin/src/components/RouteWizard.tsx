import { useEffect, useMemo, useState } from 'react';
import { api, type Prospecto, type ZonaPunto } from '../api';
import { useFilters } from '../filters';
import { useToast } from '../toast';
import { PlaceAutocompleteInput, type PlaceResult } from './PlaceAutocompleteInput';
import { MarkerPickerMap, PolygonDrawMap } from './LocationPickerMap';

interface WizardItem {
  id?: string;
  nombre: string;
  direccion: string;
  giro?: string;
  distanciaKm?: number | null;
  lat?: number | null;
  lng?: number | null;
  telefono?: string;
  manual: boolean;
  // Semana del plan a la que pertenece este prospecto (ver ZonaState/WeekConfig
  // más abajo). null = sin programar, se puede visitar en cualquier momento.
  semanaInicio: string | null;
  semanaHasta: string | null;
}

// Config de búsqueda (zona + giros) independiente por semana del plan — así
// cada semana de una ruta mensual puede apuntar a una colonia distinta.
interface ZonaState {
  modo: 'zona' | 'gps';
  ciudad: string;
  colonia: string;
  selectedCiudad: PlaceResult | null;
  selectedColonia: PlaceResult | null;
  drawZone: boolean;
  polygon: ZonaPunto[];
  polygonResetKey: number;
  lat: number | null;
  lng: number | null;
  radio: number;
  giros: string[];
  cantidad: number;
}

interface WeekConfig {
  // null,null = sin programar (una sola búsqueda, comportamiento de siempre).
  desde: string | null;
  hasta: string | null;
  zona: ZonaState;
}

type Periodo = 'ninguno' | 'semanal' | 'quincenal' | 'mensual';

const SEMANAS_POR_PERIODO: Record<Exclude<Periodo, 'ninguno'>, number> = { semanal: 1, quincenal: 2, mensual: 4 };

function toISODate(d: Date): string {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, '0'), day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
function todayISO(): string {
  return toISODate(new Date());
}
function addDaysISO(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}
const MES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function formatFechaCorta(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return `${d.getDate()} ${MES_CORTO[d.getMonth()]}`;
}
function formatRangoCorto(desde: string, hasta: string): string {
  return `${formatFechaCorta(desde)} – ${formatFechaCorta(hasta)}`;
}

function nuevaZona(giros: string[], ciudad: string, colonia: string, polygon: ZonaPunto[]): ZonaState {
  return {
    modo: 'zona', ciudad, colonia, selectedCiudad: null, selectedColonia: null,
    drawZone: false, polygon, polygonResetKey: 0, lat: null, lng: null, radio: 1500, giros, cantidad: 15,
  };
}

// Reconstruye la lista de semanas del plan al cambiar periodo/fecha de
// inicio. Las semanas que ya existían conservan su zona (para no perder lo
// que el admin ya configuró); las nuevas heredan la zona de la última semana
// conocida como punto de partida cómodo (misma ciudad/giros, ajustable después).
function construirSemanas(periodo: Periodo, fechaInicio: string, previas: WeekConfig[], zonaDefault: ZonaState): WeekConfig[] {
  if (periodo === 'ninguno') {
    return [{ desde: null, hasta: null, zona: previas[0]?.zona ?? zonaDefault }];
  }
  const n = SEMANAS_POR_PERIODO[periodo];
  const out: WeekConfig[] = [];
  for (let i = 0; i < n; i++) {
    const desde = addDaysISO(fechaInicio, i * 7);
    const hasta = addDaysISO(fechaInicio, i * 7 + 6);
    const zonaBase = previas[i]?.zona ?? out[i - 1]?.zona ?? previas[previas.length - 1]?.zona ?? zonaDefault;
    out.push({ desde, hasta, zona: { ...zonaBase } });
  }
  return out;
}

function mismaSemana(w: WeekConfig, item: { semanaInicio: string | null; semanaHasta: string | null }): boolean {
  return w.desde === item.semanaInicio && w.hasta === item.semanaHasta;
}

// Etiqueta del encabezado de cada grupo de la lista de prospectos. Un
// prospecto puede traer una fecha que ya no corresponde a ninguna semana del
// plan actual (p.ej. se acortó el periodo después de generarlo) — en ese caso
// se muestra igual con su rango, solo sin el número de semana.
function grupoLabel(key: string, item: WizardItem, weeks: WeekConfig[]): string {
  if (key === 'sin-programar') return 'Sin programar · visitar cuanto antes';
  const idx = weeks.findIndex((w) => mismaSemana(w, item));
  const rango = formatRangoCorto(item.semanaInicio!, item.semanaHasta!);
  return idx >= 0 ? `Semana ${idx + 1} · ${rango}` : `Programado · ${rango}`;
}

export function RouteWizard({ vendedorId, onClose, onSaved }: { vendedorId: string; onClose: () => void; onSaved: () => void }) {
  const { productos, vendedores, reload } = useFilters();
  const { showToast } = useToast();

  const vendedorInicial = vendedores.find((v) => v.id === vendedorId) || vendedores[0];

  const [wProductoId, setWProductoId] = useState(vendedorInicial?.productoId || '');
  const [wVendorId, setWVendorId] = useState(vendedorInicial?.id || '');
  const [wMetaSolicitudesDia, setWMetaSolicitudesDia] = useState(vendedorInicial?.metaSolicitudesDia ?? 5);
  const [wMetaVentaMes, setWMetaVentaMes] = useState(vendedorInicial?.metaVentaMes ?? 120000);

  const [periodo, setPeriodo] = useState<Periodo>('ninguno');
  const [fechaInicio, setFechaInicio] = useState(todayISO());
  const [weeks, setWeeks] = useState<WeekConfig[]>([
    { desde: null, hasta: null, zona: nuevaZona(vendedorInicial?.giros || [], vendedorInicial?.ciudad || '', vendedorInicial?.colonia || '', vendedorInicial?.zonaPoligono || []) },
  ]);
  const [activeWeekIdx, setActiveWeekIdx] = useState(0);

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState('');
  const [geoToken, setGeoToken] = useState(0);
  const [wResults, setWResults] = useState<WizardItem[]>([]);
  const [wLoading, setWLoading] = useState(false);
  const [wError, setWError] = useState('');
  const [wNewName, setWNewName] = useState('');
  const [wNewAddr, setWNewAddr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!wVendorId) return;
    api.prospectos(wVendorId).then((list: Prospecto[]) => {
      const porVisitar = list.filter((p) => p.estado === 'por_visitar');
      setWResults(porVisitar.map((p) => ({
        id: p.id, nombre: p.nombre, direccion: p.direccion, giro: p.giro || undefined,
        distanciaKm: p.distanciaKm, lat: p.lat, lng: p.lng, manual: p.origen === 'manual',
        semanaInicio: p.semanaInicio ?? null, semanaHasta: p.semanaHasta ?? null,
      })));
    }).catch(() => {});
  }, [wVendorId]);

  const producto = productos.find((p) => p.id === wProductoId);
  const vendedoresDelProducto = vendedores.filter((v) => v.productoId === wProductoId);
  const allowedGiros = producto?.giros || [];
  const isEvidenceOnly = allowedGiros.length === 0;

  const activeWeek = weeks[activeWeekIdx] ?? weeks[0];
  const activeZona = activeWeek.zona;
  const patchActiveZona = (patch: Partial<ZonaState>) => {
    setWeeks((prev) => prev.map((w, i) => (i === activeWeekIdx ? { ...w, zona: { ...w.zona, ...patch } } : w)));
  };

  const resetPlan = (giros: string[], ciudad: string, colonia: string, polygon: ZonaPunto[]) => {
    setPeriodo('ninguno');
    setFechaInicio(todayISO());
    setWeeks([{ desde: null, hasta: null, zona: nuevaZona(giros, ciudad, colonia, polygon) }]);
    setActiveWeekIdx(0);
  };

  const onProductoChange = (productoId: string) => {
    const first = vendedores.find((v) => v.productoId === productoId);
    setWProductoId(productoId);
    setWVendorId(first?.id || '');
    resetPlan(first?.giros || [], first?.ciudad || '', first?.colonia || '', first?.zonaPoligono || []);
    setWResults([]);
    setWMetaSolicitudesDia(first?.metaSolicitudesDia ?? 5);
    setWMetaVentaMes(first?.metaVentaMes ?? 120000);
  };

  const onVendorChange = (vendorId: string) => {
    const v = vendedores.find((x) => x.id === vendorId);
    if (!v) return;
    setWVendorId(v.id);
    resetPlan(v.giros, v.ciudad, v.colonia || '', v.zonaPoligono || []);
    setWResults([]);
    setWMetaSolicitudesDia(v.metaSolicitudesDia ?? 5);
    setWMetaVentaMes(v.metaVentaMes ?? 120000);
  };

  const onPeriodoChange = (p: Periodo) => {
    setPeriodo(p);
    setWeeks((prev) => construirSemanas(p, fechaInicio, prev, prev[0]?.zona ?? nuevaZona([], '', '', [])));
    setActiveWeekIdx(0);
  };

  const onFechaInicioChange = (f: string) => {
    setFechaInicio(f);
    setWeeks((prev) => construirSemanas(periodo, f, prev, prev[0]?.zona ?? nuevaZona([], '', '', [])));
  };

  const toggleGiro = (g: string) => {
    patchActiveZona({ giros: activeZona.giros.includes(g) ? activeZona.giros.filter((x) => x !== g) : [...activeZona.giros, g] });
  };

  const usarUbicacionActual = () => {
    if (!navigator.geolocation) { setGeoError('Tu navegador no soporta geolocalización.'); return; }
    setGeoLoading(true);
    setGeoError('');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        patchActiveZona({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setGeoToken((t) => t + 1);
        setGeoLoading(false);
      },
      (err) => {
        setGeoError(`No se pudo obtener tu ubicación: ${err.message}`);
        setGeoLoading(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const consultarDenue = async () => {
    const zona = activeZona;
    if (zona.modo === 'gps' && (zona.lat == null || zona.lng == null)) {
      setWError('Usa tu ubicación actual o escribe latitud/longitud antes de generar la ruta.');
      return;
    }

    // Si ya hay resultados de una búsqueda anterior de ESTA MISMA semana (no
    // manuales), hay que preguntar: si se sobrescribe, los que ya estaban
    // guardados en Firestore (tienen id) hay que borrarlos explícitamente —
    // si no, quedan huérfanos: desaparecen de este wizard pero le siguen
    // llegando al vendedor. Las demás semanas del plan no se tocan.
    const previos = wResults.filter((r) => !r.manual && mismaSemana(activeWeek, r));
    const agregar = previos.length > 0
      ? window.confirm(
        `Ya hay ${previos.length} prospecto(s) de una búsqueda anterior en esta semana.\n\n` +
        'Aceptar = agregar los nuevos resultados a los que ya están.\n' +
        'Cancelar = sobrescribir (se eliminarán esos prospectos y quedarán solo los nuevos).',
      )
      : true;

    setWLoading(true);
    setWError('');
    try {
      // Si el usuario eligió una sugerencia real del autocomplete (y no la
      // editó después), usamos esas coordenadas directo — más confiable que
      // volver a geocodificar el texto en el servidor. Si no, cae al texto
      // libre de siempre (ciudad/colonia), que el servidor geocodifica.
      const zonaResuelta = zona.selectedColonia?.description === zona.colonia && zona.colonia ? zona.selectedColonia
        : zona.selectedCiudad?.description === zona.ciudad && zona.ciudad ? zona.selectedCiudad
        : null;
      const params: Parameters<typeof api.consultarDenue>[0] = zona.modo === 'gps'
        ? { giros: zona.giros, cantidad: zona.cantidad, lat: zona.lat!, lng: zona.lng!, radioMetros: zona.radio }
        : zonaResuelta
          ? { giros: zona.giros, cantidad: zona.cantidad, lat: zonaResuelta.lat, lng: zonaResuelta.lng, radioMetros: zona.selectedColonia === zonaResuelta ? 2500 : 6000 }
          : { giros: zona.giros, cantidad: zona.cantidad, ciudad: zona.ciudad, colonia: zona.colonia };
      // El polígono manda sobre cualquier otro modo: si el usuario dibujó una
      // zona, el servidor usa esos vértices para centrar y acotar la búsqueda
      // (ver centroYRadioDePoligono en server/src/integrations/denue.ts) y
      // filtra los resultados para quedarse solo con los que caen dentro.
      if (zona.drawZone && zona.polygon.length >= 3) {
        params.poligono = zona.polygon;
      }
      const { resultados } = await api.consultarDenue(params);
      const nuevos: WizardItem[] = resultados.map((r: any) => ({
        nombre: r.nombre, direccion: r.direccion, giro: r.giro, distanciaKm: r.distanciaKm,
        lat: r.lat, lng: r.lng, telefono: r.telefono, manual: false,
        semanaInicio: activeWeek.desde, semanaHasta: activeWeek.hasta,
      }));

      if (agregar) {
        const existentes = new Set(wResults.map((r) => `${r.nombre}::${r.direccion}`));
        const soloNuevos = nuevos.filter((n) => !existentes.has(`${n.nombre}::${n.direccion}`));
        setWResults([...wResults, ...soloNuevos]);
      } else {
        const aEliminar = previos.filter((r) => r.id);
        await Promise.all(aEliminar.map((r) => api.eliminarProspecto(r.id!).catch(() => {})));
        const resto = wResults.filter((r) => !previos.includes(r));
        setWResults([...resto, ...nuevos]);
      }
    } catch (err: any) {
      if (err.code === 'DENUE_NOT_CONFIGURED') {
        setWError('El DENUE no está configurado en el servidor todavía. Define DENUE_TOKEN en las variables de entorno para consultar el API real de INEGI.');
      } else if (err.code === 'GOOGLE_MAPS_NOT_CONFIGURED') {
        setWError('Búsqueda por municipio/colonia/C.P. requiere GOOGLE_MAPS_API_KEY en el servidor. Mientras tanto, usa la pestaña "Por ubicación (GPS)".');
      } else if (err.code === 'UBICACION_NO_ENCONTRADA') {
        setWError(err.message || 'No se encontró esa ubicación.');
      } else {
        setWError(err.message || 'No se pudo consultar el DENUE');
      }
    } finally {
      setWLoading(false);
    }
  };

  const addManual = () => {
    const nombre = wNewName.trim();
    if (!nombre) { showToast('Escribe el nombre del negocio'); return; }
    const direccion = wNewAddr.trim() || `Registro manual · ${activeZona.ciudad}`;
    setWResults((prev) => [...prev, {
      nombre, direccion, giro: 'Manual', manual: true,
      semanaInicio: activeWeek.desde, semanaHasta: activeWeek.hasta,
    }]);
    setWNewName(''); setWNewAddr('');
  };

  const removeItem = async (item: WizardItem) => {
    if (item.id) {
      try { await api.eliminarProspecto(item.id); } catch { /* best effort */ }
    }
    setWResults((prev) => prev.filter((r) => r !== item));
  };

  // Agrupa la lista combinada por semana del plan para que, al planear varias
  // zonas, quede claro cuál prospecto corresponde a cuál periodo. "Sin
  // programar" va primero (se puede visitar ya) y luego por fecha.
  const grupos = useMemo(() => {
    const map = new Map<string, WizardItem[]>();
    for (const item of wResults) {
      const key = item.semanaInicio ? `${item.semanaInicio}_${item.semanaHasta}` : 'sin-programar';
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 'sin-programar') return -1;
      if (b === 'sin-programar') return 1;
      return a.localeCompare(b);
    });
  }, [wResults]);

  const save = async () => {
    if (!wVendorId) return;
    setSaving(true);
    try {
      const zonaPrincipal = weeks[0].zona;
      await Promise.all([
        api.actualizarRuta(wVendorId, {
          productoId: wProductoId, ciudad: zonaPrincipal.ciudad, colonia: zonaPrincipal.colonia,
          giros: [...new Set(weeks.flatMap((w) => w.zona.giros))],
          drawZone: zonaPrincipal.drawZone, zonaPoligono: zonaPrincipal.drawZone ? zonaPrincipal.polygon : null,
        }),
        api.actualizarMetas(wVendorId, { metaSolicitudesDia: wMetaSolicitudesDia, metaVentaMes: wMetaVentaMes }),
      ]);
      const nuevos = wResults.filter((r) => !r.id);
      if (nuevos.length) await api.bulkProspectos(wVendorId, nuevos);
      reload();
      onSaved();
      const vendedor = vendedores.find((v) => v.id === wVendorId);
      showToast(`Ruta de ${vendedor?.nombre || 'vendedor'} guardada · ${wResults.length} prospectos`);
      onClose();
    } catch (err: any) {
      showToast(err.message || 'No se pudo guardar la ruta');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,40,30,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} className="adm-scroll" style={{ width: 640, maxHeight: 800, overflowY: 'auto', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.28)' }}>
        <div style={{ padding: '22px 26px 16px', borderBottom: '1px solid #eef2ee', position: 'sticky', top: 0, background: '#fff' }}>
          <div style={{ fontSize: 19, fontWeight: 600, color: '#263238' }}>Configurar ruta de vendedor</div>
          <div style={{ fontSize: 13, color: '#8a978f', marginTop: 3 }}>Elige producto y vendedor, define la zona y los giros, y consulta el DENUE para armar la lista de prospectos (o agrégalos manualmente).</div>
        </div>

        <div style={{ padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <Section n={1} title="PRODUCTO Y VENDEDOR">
            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
              <FieldSelect label="Producto" value={wProductoId} onChange={onProductoChange} options={productos.map((p) => ({ value: p.id, label: p.nombre }))} />
              <FieldSelect label="Vendedor" value={wVendorId} onChange={onVendorChange} options={vendedoresDelProducto.map((v) => ({ value: v.id, label: v.nombre }))} />
            </div>
          </Section>

          <Section n={2} title="PERIODO DE PLANEACIÓN" hint="Una sola búsqueda, o varias semanas con su propia zona cada una — útil para armar de un jalón una ruta mensual con distintas colonias por semana">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <FieldSelect
                    label="Periodo" value={periodo} onChange={(v) => onPeriodoChange(v as Periodo)}
                    options={[
                      { value: 'ninguno', label: 'Sin programar (una sola búsqueda)' },
                      { value: 'semanal', label: 'Semanal · 1 semana' },
                      { value: 'quincenal', label: 'Quincenal · 2 semanas' },
                      { value: 'mensual', label: 'Mensual · 4 semanas' },
                    ]}
                  />
                </div>
                {periodo !== 'ninguno' && (
                  <div style={{ flex: 1, minWidth: 170 }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6 }}>Fecha de inicio</label>
                    <input type="date" value={fechaInicio} onChange={(e) => onFechaInicioChange(e.target.value)} style={{ width: '100%', border: '1px solid #d9e1db', background: '#f8faf8', borderRadius: 8, padding: '11px 13px', fontSize: 14, color: '#263238', boxSizing: 'border-box' }} />
                  </div>
                )}
              </div>

              {weeks.length > 1 && (
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {weeks.map((w, idx) => {
                    const activo = idx === activeWeekIdx;
                    const count = wResults.filter((r) => mismaSemana(w, r)).length;
                    return (
                      <button
                        key={idx} type="button" onClick={() => setActiveWeekIdx(idx)}
                        style={{
                          flex: 1, minWidth: 118, textAlign: 'left', cursor: 'pointer', borderRadius: 10, padding: '9px 12px',
                          border: '1.5px solid', borderColor: activo ? '#0f5132' : '#e0e8e2', background: activo ? '#0f5132' : '#fff',
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 700, color: activo ? '#fff' : '#263238' }}>Semana {idx + 1}</div>
                        <div style={{ fontSize: 11, color: activo ? '#cfe6d8' : '#8a978f', marginTop: 1 }}>{formatRangoCorto(w.desde!, w.hasta!)}</div>
                        <div style={{ fontSize: 10.5, color: activo ? '#cfe6d8' : '#9aa39c', marginTop: 2 }}>{count} prospecto{count === 1 ? '' : 's'}</div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </Section>

          <Section n={3} title="ZONA DE BÚSQUEDA" hint={weeks.length > 1 ? `Editando la zona de: Semana ${activeWeekIdx + 1} · ${formatRangoCorto(activeWeek.desde!, activeWeek.hasta!)}` : undefined}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 13 }}>
              <div style={{ display: 'flex', gap: 8, background: '#f2f5f2', borderRadius: 10, padding: 4 }}>
                <ModeTab label="Por municipio / colonia / C.P." active={activeZona.modo === 'zona'} onClick={() => patchActiveZona({ modo: 'zona' })} />
                <ModeTab label="Por ubicación (GPS)" active={activeZona.modo === 'gps'} onClick={() => patchActiveZona({ modo: 'gps' })} />
              </div>

              {activeZona.modo === 'zona' ? (
                <>
                  <div style={{ display: 'flex', gap: 12 }}>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6 }}>Ciudad / Municipio</label>
                      <PlaceAutocompleteInput
                        value={activeZona.ciudad}
                        onChange={(v) => patchActiveZona({ ciudad: v })}
                        onPlaceSelected={(p) => patchActiveZona({ selectedCiudad: p })}
                        placeholder="Ej. Guadalajara, Jalisco"
                        types={['(cities)']}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6 }}>Colonia o C.P.</label>
                      <PlaceAutocompleteInput
                        value={activeZona.colonia}
                        onChange={(v) => patchActiveZona({ colonia: v })}
                        onPlaceSelected={(p) => patchActiveZona({ selectedColonia: p })}
                        placeholder="Ej. Centro / 44100"
                        types={['geocode']}
                      />
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: '#8a978f', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a978f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    Elige una sugerencia de la lista para asegurar la ubicación correcta; con municipio o C.P. es suficiente, incluye colonias aledañas al kiosco.
                  </div>
                </>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end' }}>
                    <button onClick={usarUbicacionActual} disabled={geoLoading} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#eef2ee', color: '#0f5132', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, opacity: geoLoading ? 0.7 : 1 }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0f5132" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>
                      {geoLoading ? 'Obteniendo ubicación…' : 'Usar mi ubicación actual'}
                    </button>
                    <div style={{ flex: 1 }}>
                      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6 }}>Radio (m)</label>
                      <input type="number" min={200} max={10000} step={100} value={activeZona.radio} onChange={(e) => patchActiveZona({ radio: Math.max(200, Math.min(10000, parseInt(e.target.value, 10) || 1500)) })} style={{ width: '100%', border: '1px solid #d9e1db', background: '#f8faf8', borderRadius: 8, padding: '11px 13px', fontSize: 14, color: '#263238' }} />
                    </div>
                  </div>
                  {geoError && <div style={{ fontSize: 12, color: '#c0392b' }}>{geoError}</div>}
                  <div style={{ fontSize: 12, color: '#8a978f', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a978f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    Haz clic en el mapa para colocar el punto (o arrastra el marcador) — busca en un radio real alrededor de él.
                  </div>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e6ece7' }}>
                    <MarkerPickerMap
                      lat={activeZona.lat} lng={activeZona.lng}
                      onPick={(p) => patchActiveZona({ lat: p.lat, lng: p.lng })}
                      radioMetros={activeZona.radio}
                      recenterToken={geoToken}
                      height={220}
                    />
                  </div>
                  {activeZona.lat != null && activeZona.lng != null && (
                    <div style={{ fontSize: 11.5, color: '#9aa39c' }}>{activeZona.lat.toFixed(5)}, {activeZona.lng.toFixed(5)}</div>
                  )}
                </div>
              )}

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                <span onClick={() => patchActiveZona({ drawZone: !activeZona.drawZone })} style={{ width: 40, height: 23, borderRadius: 20, flex: 'none', position: 'relative', transition: 'background .15s', background: activeZona.drawZone ? '#157347' : '#cdd8d0' }}>
                  <span style={{ position: 'absolute', top: 2, left: 2, width: 19, height: 19, borderRadius: '50%', background: '#fff', transition: 'transform .15s', transform: `translateX(${activeZona.drawZone ? 17 : 0}px)` }} />
                </span>
                <span style={{ fontSize: 13, color: '#3a4a41' }}>Dibujar zona en el mapa <span style={{ color: '#8a978f' }}>(opcional)</span></span>
              </label>
              {activeZona.drawZone && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 12, color: '#8a978f', display: 'flex', alignItems: 'center', gap: 7 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#8a978f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>
                    Haz clic para agregar puntos y dibujar el contorno de la zona; arrastra un punto para ajustarlo. Al generar la ruta, los prospectos se acotan a este contorno.
                  </div>
                  <div style={{ borderRadius: 10, overflow: 'hidden', border: '1px solid #e6ece7', position: 'relative' }}>
                    <PolygonDrawMap key={activeWeekIdx * 1000 + activeZona.polygonResetKey} points={activeZona.polygon} onChange={(pts) => patchActiveZona({ polygon: pts })} height={220} />
                    {activeZona.polygon.length > 0 && (
                      <button onClick={() => patchActiveZona({ polygon: [], polygonResetKey: activeZona.polygonResetKey + 1 })} style={{ position: 'absolute', right: 12, top: 12, background: '#fff', border: 'none', borderRadius: 7, padding: '6px 10px', fontSize: 12, fontWeight: 600, color: '#c0392b', boxShadow: '0 1px 4px rgba(0,0,0,.2)' }}>Limpiar</button>
                    )}
                  </div>
                  {activeZona.polygon.length > 0 && activeZona.polygon.length < 3 && (
                    <div style={{ fontSize: 11.5, color: '#c96a1e' }}>Agrega al menos 3 puntos para que la zona sea válida.</div>
                  )}
                </div>
              )}
            </div>
          </Section>

          <Section n={4} title="GIROS DENUE (INEGI)" hint="Los giros disponibles dependen del producto del vendedor (uno o varios)">
            {isEvidenceOnly ? (
              <div style={{ background: '#f2f8f4', border: '1px solid #cfe6d8', borderRadius: 9, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 10 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></svg>
                <span style={{ fontSize: 13, color: '#2f5f45' }}>{producto?.nombre} no usa giros del DENUE: el vendedor visita a sus prospectos y <b>sube la evidencia</b> directamente.</span>
              </div>
            ) : (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 9 }}>
                {allowedGiros.map((g) => {
                  const on = activeZona.giros.includes(g);
                  return (
                    <div key={g} onClick={() => toggleGiro(g)} style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 20, fontSize: 13, fontWeight: 500,
                      cursor: 'pointer', border: '1.5px solid', background: on ? '#0f5132' : '#f8faf8', borderColor: on ? '#0f5132' : '#d9e1db', color: on ? '#fff' : '#3a4a41',
                    }}>
                      {on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
                      {g}
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          <Section n={5} title={<>LISTA DE PROSPECTOS <span style={{ fontWeight: 400, color: '#8a978f' }}>· {wResults.length} en la ruta</span></>}
            right={!isEvidenceOnly && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <label style={{ fontSize: 12.5, color: '#3a4a41' }}>Prospectos a cargar</label>
                <input type="number" min={1} max={200} value={activeZona.cantidad} onChange={(e) => patchActiveZona({ cantidad: Math.max(1, Math.min(200, parseInt(e.target.value, 10) || 10)) })} style={{ width: 62, border: '1px solid #d9e1db', background: '#f8faf8', borderRadius: 7, padding: 8, fontSize: 13, color: '#263238', textAlign: 'center' }} />
                <button onClick={consultarDenue} disabled={wLoading} style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#0f5132', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 12.5, fontWeight: 600, opacity: wLoading ? 0.7 : 1 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                  {weeks.length > 1 ? `Generar · semana ${activeWeekIdx + 1}` : 'Generar ruta'}
                </button>
              </div>
            )}
          >
            {!isEvidenceOnly && (
              <div style={{ fontSize: 11.5, color: '#8a978f', margin: '-4px 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#8a978f" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>
                El DENUE trae la cantidad indicada desde el API real de INEGI, ordenada por cercanía a la zona.
              </div>
            )}
            {wError && (
              <div style={{ background: '#fbe3e0', color: '#c0392b', borderRadius: 8, padding: '10px 12px', fontSize: 12.5, marginBottom: 10 }}>{wError}</div>
            )}
            <div style={{ border: '1px solid #e6ece7', borderRadius: 10, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div className="adm-scroll" style={{ maxHeight: 300, overflowY: 'auto' }}>
                {wLoading && (
                  <div style={{ padding: 26, textAlign: 'center', fontSize: 13, color: '#8a978f', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2.4" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.6" /></svg>
                    Consultando el DENUE de INEGI...
                  </div>
                )}
                {grupos.map(([key, items]) => (
                  <div key={key}>
                    {weeks.length > 1 && (
                      <div style={{ padding: '8px 14px', background: '#f8faf8', fontSize: 11.5, fontWeight: 700, color: '#5a665f', borderBottom: '1px solid #f2f5f2', borderTop: '1px solid #f2f5f2', textTransform: 'uppercase' }}>
                        {grupoLabel(key, items[0], weeks)}
                      </div>
                    )}
                    {items.map((pr, i) => (
                      <div key={pr.id ?? `${pr.nombre}::${pr.direccion}::${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderBottom: '1px solid #f2f5f2' }}>
                        <div style={{ width: 26, height: 26, borderRadius: '50%', flex: 'none', background: '#0f5132', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>{i + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 600, color: '#263238' }}>{pr.nombre}</div>
                          <div style={{ fontSize: 11.5, color: '#8a978f' }}>{pr.direccion}</div>
                        </div>
                        <span style={{ fontSize: 11, color: '#8a978f', whiteSpace: 'nowrap', flex: 'none' }}>{pr.manual ? 'manual' : pr.distanciaKm != null ? `${pr.distanciaKm} km` : '—'}</span>
                        <span style={{ fontSize: 11, fontWeight: 500, padding: '3px 9px', borderRadius: 6, color: pr.manual ? '#c96a1e' : '#3a4a41', background: pr.manual ? '#fdecdb' : '#eef2ee', flex: 'none' }}>{pr.manual ? 'Manual' : pr.giro}</span>
                        <button onClick={() => removeItem(pr)} title="Quitar" style={{ width: 26, height: 26, flex: 'none', border: 'none', background: '#f4f6f2', borderRadius: 7, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#c0392b" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
                {wResults.length === 0 && !wLoading && (
                  <div style={{ padding: 22, textAlign: 'center', fontSize: 12.5, color: '#9aa39c' }}>Aún no hay prospectos. Consulta el DENUE o agrégalos manualmente abajo.</div>
                )}
              </div>
              <div style={{ display: 'flex', gap: 8, padding: '11px 12px', background: '#f8faf8', borderTop: '1px dashed #cdd8d0', flex: 'none' }}>
                <input value={wNewName} onChange={(e) => setWNewName(e.target.value)} placeholder="Nombre del negocio" style={{ flex: 1.2, minWidth: 0, border: '1px solid #d9e1db', background: '#fff', borderRadius: 7, padding: '9px 11px', fontSize: 13, color: '#263238' }} />
                <input value={wNewAddr} onChange={(e) => setWNewAddr(e.target.value)} placeholder="Dirección o referencia" style={{ flex: 1.5, minWidth: 0, border: '1px solid #d9e1db', background: '#fff', borderRadius: 7, padding: '9px 11px', fontSize: 13, color: '#263238' }} />
                <button onClick={addManual} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 6, background: '#157347', color: '#fff', border: 'none', borderRadius: 7, padding: '9px 13px', fontSize: 13, fontWeight: 600 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
                  Agregar
                </button>
              </div>
            </div>
          </Section>

          <Section n={6} title="METAS DEL VENDEDOR" hint="Objetivo de solicitudes por día y de venta (colocación) por mes; se usan para medir su avance en la app del vendedor">
            <div style={{ display: 'flex', gap: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6 }}>Meta de solicitudes / día</label>
                <input
                  type="number" min={0} step={1} value={wMetaSolicitudesDia}
                  onChange={(e) => setWMetaSolicitudesDia(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{ width: '100%', border: '1px solid #d9e1db', background: '#f8faf8', borderRadius: 8, padding: '11px 13px', fontSize: 14, color: '#263238' }}
                />
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6 }}>Meta de venta / mes ($)</label>
                <input
                  type="number" min={0} step={1000} value={wMetaVentaMes}
                  onChange={(e) => setWMetaVentaMes(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  style={{ width: '100%', border: '1px solid #d9e1db', background: '#f8faf8', borderRadius: 8, padding: '11px 13px', fontSize: 14, color: '#263238' }}
                />
              </div>
            </div>
          </Section>
        </div>

        <div style={{ padding: '16px 26px 22px', display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #eef2ee', position: 'sticky', bottom: 0, background: '#fff' }}>
          <button onClick={onClose} style={{ background: '#f2f5f2', color: '#3a4a41', border: 'none', borderRadius: 8, padding: '11px 18px', fontSize: 14, fontWeight: 500 }}>Cancelar</button>
          <button onClick={save} disabled={saving || !wVendorId} style={{ background: '#157347', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar ruta del vendedor'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ n, title, hint, right, children }: { n: number; title: React.ReactNode; hint?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: hint ? 5 : 13, gap: 12, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13, fontWeight: 700, letterSpacing: '.4px', color: '#0f5132' }}>
          <span style={{ width: 22, height: 22, borderRadius: '50%', background: '#0f5132', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12 }}>{n}</span>
          {title}
        </div>
        {right}
      </div>
      {hint && <div style={{ fontSize: 12, color: '#8a978f', margin: '0 0 12px 31px' }}>{hint}</div>}
      {children}
    </div>
  );
}

function ModeTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, border: 'none', borderRadius: 8, padding: '9px 12px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        background: active ? '#fff' : 'transparent', color: active ? '#0f5132' : '#6f7d75',
        boxShadow: active ? '0 1px 4px rgba(20,60,40,.12)' : 'none',
      }}
    >
      {label}
    </button>
  );
}

function FieldSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <div style={{ flex: 1 }}>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6 }}>{label}</label>
      <div style={{ position: 'relative' }}>
        <select value={value} onChange={(e) => onChange(e.target.value)} style={selectStyle}>
          {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#6f7d75" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', right: 11, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}><polyline points="6 9 12 15 18 9" /></svg>
      </div>
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  width: '100%', WebkitAppearance: 'none', appearance: 'none', border: '1px solid #d9e1db', background: '#f8faf8',
  borderRadius: 8, padding: '11px 32px 11px 13px', fontSize: 14, color: '#263238',
};

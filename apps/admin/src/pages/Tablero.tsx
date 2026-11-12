import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  api, type BloqueTablero, type EstadoRuta, type Tablero as TableroData, type VendedorTablero, type VistaTablero,
} from '../api';
import { useFilters } from '../filters';
import { PageHeader } from '../components/FilterBar';
import { MultiSelectDropdown } from '../components/MultiSelectDropdown';
import { Aviso, Avatar, Card, ThOrden } from '../components/ui';
import { haceCuanto, sumarDias, toISODate } from '../lib/dateRanges';

// Tablero: el embudo de campo, de la meta de la ruta a la solicitud aprobada
// en HubSpot. Arriba lo que necesita cualquier persona (embudo, tasas,
// tendencia); abajo, para quien coordina, el mismo embudo por vendedor y lo
// que requiere atención. Todos los números usan el mismo periodo y se
// comparan contra el anterior cortado en el mismo punto de avance (ver
// server/src/routes/tablero.ts).

const VISTAS: { v: VistaTablero; label: string }[] = [
  { v: 'dia', label: 'Día' }, { v: 'semana', label: 'Semana' }, { v: 'mes', label: 'Mes' }, { v: 'rango', label: 'Fechas' },
];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MESES_CORTO = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

const partes = (iso: string) => {
  const d = new Date(`${iso}T12:00:00`);
  return { dia: d.getDate(), mes: d.getMonth(), anio: d.getFullYear(), dow: d.getDay() };
};
const num = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('es-MX'));
const pctTxt = (n: number | null | undefined) => (n == null ? '—' : `${n.toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`);
// En hora de México (como el resto de las fechas del tablero), sin importar la zona de la computadora.
const hora = (iso: string) => new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Mexico_City' });
const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lista = (n: string[]) => (n.length <= 3 ? n.join(', ') : `${n.slice(0, 3).join(', ')} y ${n.length - 3} más`);

function nombrePeriodo(vista: VistaTablero, desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);
  if (vista === 'dia') return `${DIAS[a.dow]} ${a.dia} de ${MESES[a.mes]}`;
  if (vista === 'mes') return `${MESES[a.mes]} ${a.anio}`;
  if (desde === hasta) return `${DIAS[a.dow]} ${a.dia} de ${MESES[a.mes]}`;
  const tramo = a.mes === b.mes ? `del ${a.dia} al ${b.dia} de ${MESES[a.mes]}` : `del ${a.dia} de ${MESES[a.mes]} al ${b.dia} de ${MESES[b.mes]}${a.anio !== b.anio ? ` ${b.anio}` : ''}`;
  return vista === 'semana' ? `semana ${tramo}` : tramo;
}

// "del 1 al 11 de noviembre" / "el miércoles 4 de noviembre".
function delAl(desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);
  if (desde === hasta) return `el ${DIAS[a.dow]} ${a.dia} de ${MESES[a.mes]}`;
  return a.mes === b.mes ? `del ${a.dia} al ${b.dia} de ${MESES[a.mes]}` : `del ${a.dia} de ${MESES[a.mes]} al ${b.dia} de ${MESES[b.mes]}`;
}

// Último día que toca un periodo cortado (fin es exclusivo).
const ultimoDia = (finIso: string) => toISODate(new Date(Date.parse(finIso) - 1));

// Contra qué se compara, en corto: "oct", "sem. del 2 nov", "mié 4 nov", "días antes".
function anteriorCorto(vista: VistaTablero, desde: string): string {
  const x = partes(desde);
  if (vista === 'dia') return `${DIAS[x.dow].slice(0, 3)} ${x.dia} ${MESES_CORTO[x.mes]}`;
  if (vista === 'semana') return `sem. del ${x.dia} ${MESES_CORTO[x.mes]}`;
  if (vista === 'mes') return MESES[x.mes];
  return 'mismos días antes';
}

function etiquetaEje(por: 'dia' | 'semana' | 'mes', desde: string): string {
  const p = partes(desde);
  if (por === 'mes') return `${MESES_CORTO[p.mes]}${p.mes === 0 ? ` ${String(p.anio).slice(2)}` : ''}`;
  if (por === 'semana') return `${p.dia} ${MESES_CORTO[p.mes]}`;
  return `${DIAS[p.dow].slice(0, 3)} ${p.dia}`;
}

function moverFecha(vista: VistaTablero, fecha: string, paso: number): string {
  if (vista === 'dia') return sumarDias(fecha, paso);
  if (vista === 'semana') return sumarDias(fecha, 7 * paso);
  const p = partes(fecha);
  return toISODate(new Date(p.anio, p.mes + paso, 1));
}

// La aprobación de un periodo reciente se calcula con pocas solicitudes ya
// resueltas (la mayoría sigue en revisión): 4 de 4 aprobadas daría "100%".
const esPreliminar = (a: BloqueTablero) =>
  a.solicitudes != null && a.solicitudes > 0 && ((a.aprobadas ?? 0) + (a.rechazadas ?? 0)) * 2 < a.solicitudes;

type Cambio = { texto: string; tono: 'bien' | 'mal' | 'neutro' } | null;
// Cambio vs el periodo anterior: % para conteos, puntos para tasas.
function cambio(actual: number | null | undefined, previo: number | null | undefined, tipo: 'pct' | 'puntos'): Cambio {
  if (actual == null || previo == null) return null;
  if (tipo === 'pct' && previo === 0) return actual > 0 ? { texto: 'nuevo', tono: 'neutro' } : null;
  const d = tipo === 'pct' ? Math.round(((actual - previo) / previo) * 100) : Math.round((actual - previo) * 10) / 10;
  if (d === 0) return { texto: 'igual', tono: 'neutro' };
  const valor = tipo === 'pct' ? `${Math.abs(d)}%` : `${Math.abs(d).toLocaleString('es-MX')} ${Math.abs(d) === 1 ? 'punto' : 'puntos'}`;
  return { texto: `${d > 0 ? '▲' : '▼'} ${valor}`, tono: d > 0 ? 'bien' : 'mal' };
}
const colorTono = (t: 'bien' | 'mal' | 'neutro') => (t === 'bien' ? '#1c7a4f' : t === 'mal' ? '#b23a2b' : '#6f7d75');

export function Tablero() {
  const { productos, vendedoresFiltrados, fProductos, fVendedores, setFProductos, setFVendedores } = useFilters();
  const [params, setParams] = useSearchParams();
  const hoyLocal = toISODate(new Date());
  // Vista y fechas viven en la URL: el enlace que se comparte abre el mismo periodo.
  const pv = params.get('vista');
  const vista: VistaTablero = pv === 'dia' || pv === 'semana' || pv === 'rango' ? pv : 'mes';
  const esFecha = (x: string | null): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x);
  const fecha = esFecha(params.get('fecha')) ? params.get('fecha')! : hoyLocal;
  const desdeRango = esFecha(params.get('desde')) ? params.get('desde')! : sumarDias(hoyLocal, -29);
  const hastaRango = esFecha(params.get('hasta')) ? params.get('hasta')! : hoyLocal;

  const [data, setData] = useState<TableroData | null>(null);
  const [rutas, setRutas] = useState<EstadoRuta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCargando(true);
    setError('');
    const periodo = vista === 'rango' ? { desde: desdeRango, hasta: hastaRango } : { fecha };
    api.tablero({ vista, ...periodo, productoIds: fProductos, vendedorIds: fVendedores })
      .then(setData)
      .catch((e) => setError(e.message || 'No se pudo cargar el tablero.'))
      .finally(() => setCargando(false));
  }, [vista, fecha, desdeRango, hastaRango, fProductos, fVendedores]);

  // Estado de las rutas (es de hoy, no del periodo): para "Requiere atención".
  useEffect(() => {
    api.rutasEstado({ productoIds: fProductos, vendedorIds: fVendedores }).then((r) => setRutas(r.items)).catch(() => {});
  }, [fProductos, fVendedores]);

  const ir = (cambios: Record<string, string>) => {
    const base: Record<string, string> = vista === 'rango' ? { vista, desde: desdeRango, hasta: hastaRango } : { vista, fecha };
    const sig = { ...base, ...cambios };
    if (sig.vista === 'rango') { delete sig.fecha; sig.desde ??= desdeRango; sig.hasta ??= hastaRango; } else { delete sig.desde; delete sig.hasta; }
    setParams(sig, { replace: true });
  };
  const hoy = data?.hoy ?? hoyLocal;
  const enCurso = data?.enCurso ?? true;
  const siguiente = moverFecha(vista, fecha, 1);
  const haySiguiente = vista === 'mes' ? siguiente.slice(0, 7) <= hoy.slice(0, 7) : siguiente <= hoy;

  const a = data?.actual;
  const p = data?.previo;
  const hs = data?.hubspot;
  const hsOk = hs?.estado === 'ok';
  const corto = data ? anteriorCorto(vista, data.anterior.desde) : '';

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" /></svg>}
        title="Tablero"
        subtitle="Del negocio planeado a la solicitud aprobada. Cada número dice qué cuenta y de dónde sale."
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <MultiSelectDropdown
          label="Producto" options={productos.map((x) => ({ value: x.id, label: x.nombre }))}
          selected={fProductos} onChange={setFProductos} placeholder="Todos los productos"
        />
        <MultiSelectDropdown
          label="Vendedor"
          options={vendedoresFiltrados.map((v) => ({ value: v.id, label: v.nombre, grupo: v.estado === 'Baja' ? 'Ya no activos' : undefined }))}
          selected={fVendedores} onChange={setFVendedores} placeholder="Todos los vendedores"
        />
        <div role="tablist" aria-label="Ver por" style={{ display: 'inline-flex', border: '1px solid #d9e1db', borderRadius: 9, overflow: 'hidden', background: '#fff' }}>
          {VISTAS.map((x, i) => (
            <button
              key={x.v} role="tab" aria-selected={vista === x.v}
              onClick={() => ir(x.v === 'rango' ? { vista: 'rango' } : { vista: x.v, fecha: enCurso || vista === 'rango' ? hoy : fecha })}
              style={{ border: 'none', borderLeft: i ? '1px solid #d9e1db' : 'none', padding: '8px 15px', fontSize: 13, fontWeight: vista === x.v ? 600 : 500, background: vista === x.v ? '#157347' : '#fff', color: vista === x.v ? '#fff' : '#3a4a41', cursor: 'pointer' }}
            >{x.label}</button>
          ))}
        </div>
        {vista === 'rango' ? (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#6f7d75' }}>
            <input type="date" value={desdeRango} max={hastaRango} onChange={(e) => e.target.value && ir({ desde: e.target.value })} style={fechaInput} />
            a
            <input type="date" value={hastaRango} min={desdeRango} max={hoy} onChange={(e) => e.target.value && ir({ hasta: e.target.value })} style={fechaInput} />
          </span>
        ) : (
          <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1px solid #d9e1db', borderRadius: 9 }}>
            <button aria-label="Periodo anterior" onClick={() => ir({ fecha: moverFecha(vista, fecha, -1) })} style={flecha}>‹</button>
            <span style={{ fontSize: 13, fontWeight: 600, color: '#263238', padding: '0 6px', minWidth: 150, textAlign: 'center' }}>
              {data && data.vista === vista ? capitalizar(nombrePeriodo(vista, data.periodo.desde, data.periodo.hasta)) : '…'}
            </span>
            <button aria-label="Periodo siguiente" disabled={!haySiguiente} onClick={() => ir({ fecha: siguiente > hoy ? hoy : siguiente })} style={{ ...flecha, opacity: haySiguiente ? 1 : 0.3, cursor: haySiguiente ? 'pointer' : 'default' }}>›</button>
          </div>
        )}
        {data && vista !== 'rango' && !enCurso && (
          <button onClick={() => ir({ fecha: hoy })} style={{ background: 'none', border: 'none', color: '#157347', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>Ir al periodo actual</button>
        )}
      </div>

      {data && (
        <div style={{ fontSize: 13, color: '#5a665f', marginBottom: 12, lineHeight: 1.5 }}>
          {data.enCurso ? (
            <>
              Se muestra <b style={negro}>{delAl(data.periodo.desde, ultimoDia(data.periodo.fin))} hasta las {hora(data.periodo.fin)}</b> y se compara contra{' '}
              <b style={negro}>{delAl(data.anterior.desde, ultimoDia(data.anterior.fin))} hasta la misma hora</b>
              {vista === 'dia' ? ': el mismo día de la semana pasada (un lunes no se parece a un sábado).' : ': el mismo avance, para que la comparación sea justa aunque el periodo no haya terminado.'}
            </>
          ) : (
            <>Se muestra <b style={negro}>{nombrePeriodo(vista, data.periodo.desde, data.periodo.hasta)}</b> completo y se compara contra <b style={negro}>{nombrePeriodo(vista, data.anterior.desde, data.anterior.hasta)}</b>.</>
          )}
        </div>
      )}

      {error && <div style={{ marginBottom: 12 }}><Aviso tono="error">{error}</Aviso></div>}
      {hs?.estado === 'sin_configurar' && (
        <div style={{ marginBottom: 12 }}><Aviso tono="alerta">
          <b>HubSpot no está conectado.</b> Solicitudes, aprobación y conversión aparecen en cuanto se configure <code>HUBSPOT_TOKEN</code> en el servidor. Mientras tanto se muestran las solicitudes que marcaron los vendedores en campo, sin confirmar.
        </Aviso></div>
      )}
      {hs?.estado === 'error' && (
        <div style={{ marginBottom: 12 }}><Aviso tono="error">
          <b>No se pudo consultar HubSpot en este momento</b> ({hs.mensaje}). Los números de visitas sí están al día; vuelve a cargar en unos minutos.
        </Aviso></div>
      )}

      <div style={{ opacity: cargando && data ? 0.55 : 1, transition: 'opacity .15s' }}>
        <Card titulo="Embudo del periodo" subtitulo={data ? `Cada paso sale del anterior. Debajo de cada número, cómo iba ${vista === 'rango' ? 'en los mismos días justo antes' : `en ${corto}`}.` : undefined}>
          {a && p ? (
            <>
              <Embudo a={a} p={p} hsOk={hsOk} corto={corto} />
              <Tasas a={a} p={p} hsOk={hsOk} />
            </>
          ) : <Vacio />}
        </Card>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(440px, 100%), 1fr))', gap: 14, marginTop: 14 }}>
          {data ? <Tendencia data={data} hsOk={hsOk} /> : <Card><Vacio /></Card>}
          <Card titulo="Por producto" subtitulo="El mismo embudo, separado por el producto de cada vendedor">
            {data && data.porProducto.length > 0 ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={tabla}>
                  <thead><tr>{['Producto', 'Meta', 'Visitados', 'Solicitudes', 'Conversión', 'Aprobación'].map((h, i) => <th key={h} style={th(i === 0)}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.porProducto.map((r) => (
                      <tr key={r.productoId}>
                        <td style={td(true)}><b style={{ color: '#263238', fontWeight: 600 }}>{r.producto}</b></td>
                        <td style={td()}>{r.meta ? num(r.meta) : '—'}</td>
                        <td style={td()}>{num(r.negociosVisitados)}{r.avanceMeta != null && <Sub>{pctTxt(r.avanceMeta)} de la meta</Sub>}</td>
                        <td style={td()}>{num(hsOk ? r.solicitudes : r.marcadas)}</td>
                        <td style={td()}>{pctTxt(r.conversion)}</td>
                        <td style={td()}>{pctTxt(r.aprobacion)}{r.aprobadas != null && <Sub>de {num(r.aprobadas + (r.rechazadas ?? 0))} con respuesta</Sub>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <Vacio texto={data ? 'Sin datos en este periodo.' : undefined} />}
          </Card>
        </div>

        {data && <PorVendedor data={data} hsOk={hsOk} onElegir={(id) => setFVendedores([id])} />}
        {data && <RequiereAtencion data={data} rutas={rutas} />}

        <div style={{ fontSize: 12, color: '#8a978f', marginTop: 14, lineHeight: 1.6 }}>
          <b style={{ color: '#6f7d75' }}>De dónde salen los datos:</b> las visitas y la meta, de la app de vendedores y de las rutas (al momento). Las solicitudes y su aprobación, de HubSpot
          (pipeline de campo; se consultan al abrir esta página, con hasta 15 min de retraso); la aprobación es el estado de hoy de las solicitudes creadas en el periodo.
          Las visitas de personas que ya no están activas siguen contando en su periodo.
        </div>
      </div>

    </div>
  );
}

// ---------- Embudo ----------

const ALTOS = [100, 88, 76, 64, 52, 42];
const COLORES = ['#9aa8a0', '#7cc49c', '#5cb283', '#3b9a68', '#157347', '#0d3d24'];

function Embudo({ a, p, hsOk, corto }: { a: BloqueTablero; p: BloqueTablero; hsOk: boolean; corto: string }) {
  const etapas: { n: number | null; prev: number | null; l: string; det: string; fuente?: boolean; sinFlecha?: boolean }[] = [
    {
      n: a.meta, prev: p.meta, l: a.metaPropios ? 'Meta' : 'Meta de la ruta',
      det: a.metaPropios ? `${num(a.metaRuta)} planeados en la ruta + ${num(a.metaPropios)} nuevos que encuentran ellos` : 'negocios planeados para estos días',
    },
    { n: a.negociosVisitados, prev: p.negociosVisitados, l: 'Visitados', det: 'negocios distintos, en persona' },
    { n: a.negociosReales, prev: p.negociosReales, l: 'Reales', det: a.noValidos ? `sin ${num(a.noValidos)} cerrados o que no existen` : 'ninguno cerrado o inexistente' },
    { n: a.interesados, prev: p.interesados, l: 'Con interés', det: 'solicitud, información o volver otro día' },
    hsOk
      ? { n: a.solicitudes, prev: p.solicitudes, l: 'Solicitudes', det: 'confirmadas en HubSpot a ±30 min de la visita', fuente: true }
      : { n: a.marcadas, prev: p.marcadas, l: 'Solicitudes marcadas', det: 'en campo, sin confirmar en HubSpot' },
  ];
  // Mientras la aprobación sea preliminar, comparar aprobadas contra un
  // periodo que ya tuvo tiempo de resolverse siempre daría "▼".
  if (hsOk) etapas.push({ n: a.aprobadas, prev: p.aprobadas, l: 'Aprobadas', det: `${num(a.rechazadas)} rechazadas · ${num(a.enProceso)} en revisión`, fuente: true, sinFlecha: esPreliminar(a) });
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${etapas.length}, minmax(0, 1fr))`, overflowX: 'auto' }}>
      {etapas.map((e, i) => {
        const c = e.sinFlecha ? null : cambio(e.n, e.prev, 'pct');
        return (
          <div key={e.l} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', padding: '0 4px', minWidth: 120 }}>
            <div style={{ height: ALTOS[0], width: '100%', display: 'flex', alignItems: 'center' }}>
              <div style={{
                height: ALTOS[i], width: '100%', background: COLORES[i], color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 30, fontWeight: 600, fontVariantNumeric: 'tabular-nums',
                clipPath: i === 0 ? 'polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%)' : 'polygon(0 0, 92% 0, 100% 50%, 92% 100%, 0 100%, 8% 50%)',
              }}>{num(e.n)}</div>
            </div>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: '#263238', marginTop: 10 }}>
              {e.l}{e.fuente && <Fuente />}
            </div>
            <div style={{ fontSize: 11.5, color: '#8a978f', marginTop: 3, lineHeight: 1.4 }}>{e.det}</div>
            <div style={{ fontSize: 12, color: '#8a978f', marginTop: 5 }}>
              {corto}: <b style={{ color: '#5a665f', fontWeight: 600 }}>{i === 0 && !e.prev ? 'sin ruta' : num(e.prev)}</b>
              {c && c.texto !== 'nuevo' && <b style={{ color: colorTono(c.tono), fontWeight: 600 }}> {c.texto}</b>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Tasas({ a, p, hsOk }: { a: BloqueTablero; p: BloqueTablero; hsOk: boolean }) {
  const preliminar = esPreliminar(a);
  const tasas: { k: string; v: number | null; prev: number | null; f: string; nota?: ReactNode; sinComparar?: boolean }[] = [
    {
      k: 'Avance de la meta', v: a.avanceMeta, prev: p.avanceMeta,
      f: !a.meta ? 'No hay ruta planeada para estos días'
        : a.metaPropios ? `${num(a.rutaVisitados)} de ${num(a.metaRuta)} negocios de la ruta y ${num(a.propios)} de ${num(a.metaPropios)} negocios nuevos (lo de más en uno no cubre lo que falta en el otro)`
          : `${num(a.rutaVisitados)} negocios visitados de ${num(a.metaRuta)} planeados en la ruta`,
    },
    {
      k: 'Conversión', v: a.conversion, prev: p.conversion,
      f: hsOk ? `${num(a.solicitudes)} solicitudes de ${num(a.negociosReales)} negocios reales visitados` : 'Aparece al conectar HubSpot',
    },
    {
      k: 'Aprobación', v: a.aprobacion, prev: p.aprobacion, sinComparar: preliminar,
      f: hsOk ? `${num(a.aprobadas)} aprobadas de ${num((a.aprobadas ?? 0) + (a.rechazadas ?? 0))} con respuesta; las ${num(a.enProceso)} en revisión todavía no cuentan` : 'Aparece al conectar HubSpot',
      nota: preliminar ? <span style={{ color: '#94500f', background: '#fff5ea', borderRadius: 6, padding: '2px 8px', fontSize: 11.5 }}><b>Preliminar:</b> menos de la mitad tiene respuesta; puede cambiar mucho</span> : undefined,
    },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(240px, 100%), 1fr))', gap: 14, marginTop: 18 }}>
      {tasas.map((t) => {
        const c = t.sinComparar ? null : cambio(t.v, t.prev, 'puntos');
        return (
          <div key={t.k} style={{ borderTop: '2px solid #dcebe1', paddingTop: 10, textAlign: 'center' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#157347', letterSpacing: '.04em', textTransform: 'uppercase' }}>{t.k}</div>
            <div style={{ fontSize: 30, fontWeight: 600, color: '#1f2a24', marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>{pctTxt(t.v)}</div>
            {c && <div style={{ fontSize: 12, color: '#8a978f' }}><b style={{ color: colorTono(c.tono), fontWeight: 600 }}>{c.texto}</b> vs {pctTxt(t.prev)} antes</div>}
            <div style={{ fontSize: 12, color: '#4f5c55', marginTop: 4, lineHeight: 1.4 }}>{t.f}</div>
            {t.nota && <div style={{ marginTop: 6 }}>{t.nota}</div>}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Tendencia ----------

function Tendencia({ data, hsOk }: { data: TableroData; hsOk: boolean }) {
  const [serie, setSerie] = useState<'solicitudes' | 'visitas'>('solicitudes');
  const [hover, setHover] = useState<number | null>(null);
  const filas = data.tendencia.map((t) => ({
    ...t,
    total: serie === 'visitas' ? t.visitas : (hsOk ? t.solicitudes : t.marcadas) ?? 0,
    oscuro: serie === 'solicitudes' && hsOk ? t.aprobadas ?? 0 : 0,
  }));
  const max = Math.max(1, ...filas.map((s) => s.total));
  const alto = 170;
  const por = data.tendenciaPor;
  const nombrePor = por === 'dia' ? 'día' : por;
  const sub = data.vista === 'rango' ? `Cada ${nombrePor} del periodo elegido` : `Últimos ${filas.length} ${por === 'mes' ? 'meses' : por === 'semana' ? 'semanas' : 'días'}`;
  return (
    <Card
      titulo={`Tendencia por ${nombrePor}`}
      subtitulo={`${sub}${serie === 'solicitudes' && hsOk ? ' · la parte oscura son las aprobadas' : serie === 'solicitudes' ? ' · marcadas en campo' : ''}`}
      accion={
        <div style={{ display: 'inline-flex', border: '1px solid #d9e1db', borderRadius: 8, overflow: 'hidden' }}>
          {(['solicitudes', 'visitas'] as const).map((s) => (
            <button key={s} onClick={() => setSerie(s)} style={{ border: 'none', padding: '5px 11px', fontSize: 12, fontWeight: serie === s ? 600 : 500, background: serie === s ? '#e2efe6' : '#fff', color: serie === s ? '#0f5132' : '#3a4a41', cursor: 'pointer' }}>
              {capitalizar(s)}
            </button>
          ))}
        </div>
      }
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: filas.length > 20 ? 2 : 8, height: alto, borderBottom: '1px solid #cfd8d2', paddingTop: 22 }}>
        {filas.map((s, i) => {
          const h = (s.total / max) * (alto - 22);
          return (
            <div key={s.desde} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative' }}>
              {filas.length <= 16 && <span style={{ fontSize: 11.5, fontWeight: 600, color: '#3a4a41', marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>{s.total || ''}</span>}
              <div style={{
                width: '62%', maxWidth: 34, minWidth: 3, height: h, minHeight: s.total ? 2 : 0, borderRadius: '4px 4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                background: s.parcial ? 'repeating-linear-gradient(135deg, #b9dfc8 0 4px, #d8eee1 4px 8px)' : '#9fd0b4',
                outline: hover === i ? '2px solid #0d3d24' : 'none',
              }}>
                {s.oscuro > 0 && <div style={{ height: `${(s.oscuro / s.total) * 100}%`, background: '#157347' }} />}
              </div>
              {hover === i && (
                <div style={{ position: 'absolute', bottom: h + 26, left: '50%', transform: 'translateX(-50%)', background: '#1f2a24', color: '#fff', borderRadius: 8, padding: '7px 10px', whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{num(s.total)} {serie === 'visitas' ? 'visitas' : hsOk ? 'solicitudes' : 'marcadas en campo'}</div>
                  {serie === 'solicitudes' && hsOk && <div>{num(s.aprobadas)} aprobadas · {num(s.rechazadas)} rechazadas</div>}
                  <div style={{ color: '#c5d6cb' }}>{capitalizar(nombrePeriodo(por === 'mes' ? 'mes' : por === 'semana' ? 'semana' : 'dia', s.desde, s.hasta))}{s.parcial ? ' · en curso' : ''}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: filas.length > 20 ? 2 : 8, marginTop: 5 }}>
        {filas.map((s, i) => (
          <span key={s.desde} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: s.parcial ? '#157347' : '#8a978f', fontWeight: s.parcial ? 600 : 400, whiteSpace: 'nowrap', overflow: 'visible' }}>
            {i % Math.ceil(filas.length / 10) === 0 ? `${etiquetaEje(por, s.desde)}${s.parcial ? '*' : ''}` : ''}
          </span>
        ))}
      </div>
      {filas.some((s) => s.parcial) && <div style={{ fontSize: 11.5, color: '#8a978f', marginTop: 8 }}>* En curso: todavía no termina.</div>}
    </Card>
  );
}

// ---------- Por vendedor ----------

type Col = 'nombre' | 'meta' | 'avanceMeta' | 'solicitudes' | 'conversion' | 'aprobacion' | 'confirmacion' | 'enNegocio' | 'ultimaVisita';

function PorVendedor({ data, hsOk, onElegir }: { data: TableroData; hsOk: boolean; onElegir: (id: string) => void }) {
  const [orden, setOrden] = useState<{ k: Col; desc: boolean }>({ k: 'solicitudes', desc: true });
  const filas = useMemo(() => {
    const val = (f: VendedorTablero): number | string => {
      if (orden.k === 'solicitudes') return (hsOk ? f.solicitudes : f.marcadas) ?? -1;
      const v = f[orden.k];
      return v == null ? -1 : v;
    };
    return [...data.porVendedor].sort((x, y) => {
      const a = val(x), b = val(y);
      const c = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b) : Number(a) - Number(b);
      return orden.desc ? -c : c;
    });
  }, [data, orden, hsOk]);
  const yaNo = data.porVendedor.filter((v) => !v.activo).length;
  const cols = 'minmax(180px, 2fr) 60px minmax(120px, 1.1fr) 80px 85px 95px 85px 130px 95px';
  return (
    <Card
      titulo="Por vendedor"
      subtitulo={`El embudo de cada persona · ${data.equipo.conVisitas} de ${data.equipo.activos} vendedores activos visitaron en el periodo${yaNo ? ` · incluye ${yaNo === 1 ? 'a 1 persona que ya no está activa' : `a ${yaNo} personas que ya no están activas`}` : ''} · clic en un nombre para ver solo su embudo`}
      style={{ marginTop: 14 }} padding="18px 0 6px" paddingEncabezado="0 20px"
    >
      <div style={{ overflowX: 'auto' }}>
        <div style={{ minWidth: 900 }}>
          <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '0 20px 10px', fontSize: 12, fontWeight: 600, color: '#6f7d75', borderBottom: '1px solid #eef2ee' }}>
            <ThOrden k="nombre" orden={orden} setOrden={setOrden}>Vendedor</ThOrden>
            <ThOrden k="meta" orden={orden} setOrden={setOrden} alinear="right">Meta</ThOrden>
            <ThOrden k="avanceMeta" orden={orden} setOrden={setOrden}>Avance de meta</ThOrden>
            <ThOrden k="solicitudes" orden={orden} setOrden={setOrden} alinear="right">Solicitudes</ThOrden>
            <ThOrden k="conversion" orden={orden} setOrden={setOrden} alinear="right">Conversión</ThOrden>
            <ThOrden k="aprobacion" orden={orden} setOrden={setOrden} alinear="right">Aprobación</ThOrden>
            <ThOrden k="confirmacion" orden={orden} setOrden={setOrden} alinear="right">En HubSpot</ThOrden>
            <span title="Visitas guardadas con la tablet a 50 m o menos del negocio. Solo se puede comprobar en negocios de la ruta (traen la ubicación oficial del DENUE) y cuando la tablet tenía GPS."><ThOrden k="enNegocio" orden={orden} setOrden={setOrden} alinear="right">En el negocio</ThOrden></span>
            <ThOrden k="ultimaVisita" orden={orden} setOrden={setOrden} alinear="right">Última visita</ThOrden>
          </div>
          {filas.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#9aa39c', fontSize: 13 }}>No hay vendedores en este filtro.</div>}
          {filas.map((f) => (
            <div key={f.id} className="rowh" style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, alignItems: 'center', padding: '9px 20px', borderBottom: '1px solid #f2f5f2', fontSize: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <span style={{ opacity: f.activo ? 1 : 0.45 }}><Avatar color={f.color} iniciales={f.iniciales} size={30} /></span>
                <div style={{ minWidth: 0 }}>
                  <button className="link-negocio" onClick={() => onElegir(f.id)} title="Ver solo el embudo de esta persona" style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', textDecoration: 'none' }}>{f.nombre}</button>
                  <div style={{ fontSize: 11, color: '#8a978f' }}>
                    {f.producto}
                    {!f.activo && ' · ya no activo'}
                    {f.sinUsuarioHubspot && f.marcadas > 0 && <span style={{ color: '#94500f' }}> · sin usuario en HubSpot</span>}
                  </div>
                </div>
              </div>
              <div style={celdaNum}>{f.meta ? num(f.meta) : <SinDato texto="sin ruta" ayuda="No tenía negocios planeados en su ruta para estos días." />}</div>
              <div>
                {f.meta ? <BarraAvance pct={f.avanceMeta} /> : <SinDato texto="sin ruta" alinear="left" ayuda="No tenía negocios planeados en su ruta para estos días, así que no hay meta contra la cual medir." />}
                <div style={{ fontSize: 11, color: '#9aa39c', marginTop: 2 }}>
                  {f.metaPropios ? `ruta ${num(f.rutaVisitados)}/${num(f.metaRuta)} · nuevos ${num(f.propios)}/${num(f.metaPropios)}` : `${num(f.negociosVisitados)} visitados`}
                </div>
              </div>
              <div style={celdaNum}>{num(hsOk ? f.solicitudes : f.marcadas)}</div>
              <div style={celdaNum}>
                {f.conversion != null ? <>{pctTxt(f.conversion)}<Sub>de {num(f.negociosReales)} negocios</Sub></>
                  : <SinDato texto={f.visitas ? '—' : 'sin visitas'} ayuda={f.visitas ? 'Se calcula con las solicitudes confirmadas en HubSpot.' : 'No visitó ningún negocio en el periodo.'} />}
              </div>
              <div style={celdaNum}>
                {f.aprobacion != null ? <>{pctTxt(f.aprobacion)}<Sub>de {num((f.aprobadas ?? 0) + (f.rechazadas ?? 0))} con respuesta</Sub></>
                  : (f.solicitudes ?? 0) > 0
                    ? <SinDato texto="en revisión" ayuda="Sus solicitudes del periodo todavía no tienen respuesta (ni aprobadas ni rechazadas)." />
                    : <SinDato texto="sin solicitudes" ayuda="No tuvo solicitudes confirmadas en el periodo; no hay nada que aprobar." />}
              </div>
              <div style={celdaNum}>
                {f.confirmadasVisitas != null && f.marcadas ? `${num(f.confirmadasVisitas)} de ${num(f.marcadas)}`
                  : <SinDato texto="sin solicitudes" ayuda="No marcó ninguna visita como «Hizo solicitud» en el periodo." />}
              </div>
              <div style={celdaNum}><EnNegocio f={f} /></div>
              <div style={{ textAlign: 'right', color: '#5a665f', fontSize: 12.5 }}>{f.ultimaVisita ? haceCuanto(f.ultimaVisita) : <SinDato texto="sin visitas" ayuda="No visitó ningún negocio en el periodo." />}</div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ padding: '10px 20px 8px', fontSize: 11.5, color: '#8a978f', lineHeight: 1.5 }}>
        <b style={{ color: '#6f7d75' }}>En el negocio:</b> de las visitas que se pueden comprobar, cuántas se guardaron con la tablet a 50 m o menos del negocio.
        Se comprueba contra la ubicación oficial del negocio (DENUE), así que no se pueden medir las visitas a <b style={{ color: '#6f7d75' }}>negocios nuevos</b> (su única
        ubicación es la que manda el propio vendedor: siempre daría "sí"), a negocios <b style={{ color: '#6f7d75' }}>agregados a mano</b> en la ruta (no tienen coordenadas)
        ni las que se guardaron <b style={{ color: '#6f7d75' }}>sin GPS</b>. Esas no cuentan ni a favor ni en contra; debajo de cada porcentaje se dice cuántas son
        («3 nuevos · 1 a mano · 2 sin GPS»).
      </div>
    </Card>
  );
}

// "3 nuevos · 1 a mano · 2 sin GPS" (la nota al pie de la tabla explica cada uno).
function motivosTxt(sc: BloqueTablero['sinComprobar']): string {
  return [
    sc.nuevo && `${num(sc.nuevo)} ${sc.nuevo === 1 ? 'nuevo' : 'nuevos'}`,
    sc.sinUbicacion && `${num(sc.sinUbicacion)} a mano`,
    sc.sinGps && `${num(sc.sinGps)} sin GPS`,
  ].filter(Boolean).join(' · ');
}

const AYUDA_SIN_COMPROBAR = 'Solo se puede comprobar contra la ubicación oficial del negocio (DENUE). Los negocios nuevos solo tienen la ubicación que manda el propio vendedor (compararla consigo misma siempre daría "sí"), los agregados a mano en la ruta no tienen coordenadas, y sin GPS no hay dónde estaba la tablet. Esas visitas no cuentan ni a favor ni en contra.';

// "En el negocio" de un vendedor: el % solo con lo comprobable y, debajo,
// cuántas visitas quedaron fuera y por qué; nunca una celda vacía.
function EnNegocio({ f }: { f: VendedorTablero }) {
  const fuera = f.sinComprobar.nuevo + f.sinComprobar.sinGps + f.sinComprobar.sinUbicacion;
  if (!f.visitas) return <SinDato texto="sin visitas" ayuda="No visitó ningún negocio en el periodo." />;
  if (f.enNegocio == null) {
    return (
      <span title={AYUDA_SIN_COMPROBAR} style={{ display: 'block', textAlign: 'right', fontSize: 11.5, fontWeight: 400, color: '#6f7d75', cursor: 'help', lineHeight: 1.35 }}>
        no se pueden medir
        <span style={{ display: 'block', color: '#9aa39c' }}>{motivosTxt(f.sinComprobar)}</span>
      </span>
    );
  }
  return (
    <span title={fuera ? AYUDA_SIN_COMPROBAR : 'Visitas guardadas con la tablet a 50 m o menos del negocio.'} style={{ cursor: 'help' }}>
      {pctTxt(f.enNegocio)}
      <Sub>de {num(f.validables)} {f.validables === 1 ? 'comprobable' : 'comprobables'}</Sub>
      {fuera > 0 && <Sub>no se miden: {motivosTxt(f.sinComprobar)}</Sub>}
    </span>
  );
}

function BarraAvance({ pct }: { pct: number | null }) {
  if (pct == null) return <span style={{ color: '#9aa39c' }}>—</span>;
  const color = pct >= 85 ? '#22a36c' : pct >= 60 ? '#e0a526' : '#d64545';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 64, height: 7, borderRadius: 4, background: '#edf1ee', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: color }} />
      </span>
      <b style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#263238' }}>{pctTxt(pct)}</b>
    </span>
  );
}

// ---------- Requiere atención ----------

function RequiereAtencion({ data, rutas }: { data: TableroData; rutas: EstadoRuta[] }) {
  const activos = new Map(data.porVendedor.filter((v) => v.activo).map((v) => [v.id, v]));
  const deRuta = rutas.filter((r) => activos.has(r.vendedorId));
  const nombre = (id: string) => activos.get(id)?.nombre ?? '';
  const filas = [...activos.values()];
  const alertas = [
    { titulo: 'Sin ruta asignada', nombres: deRuta.filter((r) => r.pendientes === 0).map((r) => nombre(r.vendedorId)), link: '/rutas?filtro=sin_ruta', accion: 'Planear rutas' },
    { titulo: 'Su ruta se acaba en ≤2 días', nombres: deRuta.filter((r) => r.pendientes > 0 && r.diasRestantes != null && r.diasRestantes <= 2).map((r) => nombre(r.vendedorId)), link: '/rutas?filtro=por_vencer', accion: 'Renovar rutas' },
    { titulo: 'Con 5+ paradas atrasadas', nombres: deRuta.filter((r) => r.atrasadas >= 5).sort((x, y) => y.atrasadas - x.atrasadas).map((r) => `${nombre(r.vendedorId)} (${r.atrasadas})`), link: '/rutas', accion: 'Ver rutas' },
    { titulo: 'Sin visitas en el periodo', nombres: filas.filter((f) => f.visitas === 0).map((f) => f.nombre), link: '/en-vivo', accion: 'Ver en vivo' },
    // Con 1 o 2 visitas comprobables un 0% no dice nada: se pide un mínimo.
    { titulo: 'Menos de la mitad de sus visitas en el negocio', nombres: filas.filter((f) => f.enNegocio != null && f.validables >= 3 && f.enNegocio < 50).map((f) => `${f.nombre} (${pctTxt(f.enNegocio)} de ${num(f.validables)})`), link: '/visitas', accion: 'Revisar visitas' },
    { titulo: 'Menos de la mitad de sus solicitudes en HubSpot', nombres: filas.filter((f) => f.confirmacion != null && f.marcadas >= 2 && f.confirmacion < 50).map((f) => `${f.nombre} (${num(f.confirmadasVisitas)} de ${num(f.marcadas)})`), link: '/visitas', accion: 'Revisar visitas' },
  ].filter((x) => x.nombres.length);
  const [abierto, setAbierto] = useState(false);
  if (!alertas.length) return null;
  return (
    <Card style={{ marginTop: 14 }} padding="16px 20px">
      <button onClick={() => setAbierto((x) => !x)} aria-expanded={abierto} style={{ display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', background: 'none', border: 'none', padding: 0, cursor: 'pointer', font: 'inherit', textAlign: 'left' }}>
        <span>
          <span style={{ fontSize: 15.5, fontWeight: 600, color: '#263238' }}>Requiere atención</span>
          <span style={{ fontSize: 12.5, color: '#8a978f', marginLeft: 8 }}>para quien coordina el equipo</span>
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ background: '#fdecdb', color: '#94500f', fontSize: 12, fontWeight: 600, borderRadius: 999, padding: '3px 10px' }}>{alertas.length} {alertas.length === 1 ? 'tema' : 'temas'}</span>
          <span style={{ color: '#6f7d75', fontSize: 13 }}>{abierto ? 'Ocultar ▴' : 'Ver ▾'}</span>
        </span>
      </button>
      {abierto && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(min(280px, 100%), 1fr))', gap: 12, marginTop: 14 }}>
          {alertas.map((x) => (
            <div key={x.titulo} style={{ border: '1px solid #f3dcc4', background: '#fffaf4', borderRadius: 10, padding: '12px 14px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: '#7a4511' }}>{x.titulo}</span>
                <span style={{ fontSize: 20, fontWeight: 600, color: '#94500f' }}>{x.nombres.length}</span>
              </div>
              <div style={{ fontSize: 12.5, color: '#6f5a45', marginTop: 4, lineHeight: 1.45 }}>{lista(x.nombres)}</div>
              <Link to={x.link} style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 600 }}>{x.accion} →</Link>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// ---------- Piezas ----------

const Fuente = () => <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, color: '#b2431f', background: '#fff0eb', borderRadius: 999, padding: '1px 6px', verticalAlign: 2 }}>HubSpot</span>;
// Celda sin número: dice por qué, en vez de un "—" que parece un error.
const SinDato = ({ texto, ayuda, alinear = 'right' }: { texto: string; ayuda: string; alinear?: 'left' | 'right' }) => (
  <span title={ayuda} style={{ display: 'block', textAlign: alinear, fontSize: 11.5, fontWeight: 400, color: '#9aa39c', cursor: 'help' }}>{texto}</span>
);
const Sub = ({ children }: { children: ReactNode }) => <div style={{ fontSize: 11, color: '#9aa39c', fontWeight: 400 }}>{children}</div>;
const Vacio = ({ texto }: { texto?: string }) => <div style={{ padding: 20, color: '#9aa39c', fontSize: 13, textAlign: 'center' }}>{texto ?? 'Cargando…'}</div>;

const negro: CSSProperties = { color: '#263238', fontWeight: 600 };
const flecha: CSSProperties = { background: 'none', border: 'none', fontSize: 18, lineHeight: 1, color: '#3a4a41', padding: '6px 10px', cursor: 'pointer' };
const fechaInput: CSSProperties = { border: '1px solid #d9e1db', background: '#fff', borderRadius: 8, padding: '7px 10px', fontSize: 13, color: '#263238' };
const tabla: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 460 };
const th = (izq = false): CSSProperties => ({ textAlign: izq ? 'left' : 'right', fontSize: 12, fontWeight: 600, color: '#6f7d75', padding: '6px 8px', borderBottom: '1px solid #eef2ee', whiteSpace: 'nowrap' });
const td = (izq = false): CSSProperties => ({ textAlign: izq ? 'left' : 'right', padding: '9px 8px', borderBottom: '1px solid #f2f5f2', fontVariantNumeric: 'tabular-nums', color: '#3a4a41', verticalAlign: 'top' });
const celdaNum: CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#263238' };

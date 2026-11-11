import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api, type BloqueTablero, type Tablero as TableroData, type VistaTablero } from '../api';
import { useFilters } from '../filters';
import { PageHeader } from '../components/FilterBar';
import { MultiSelectDropdown } from '../components/MultiSelectDropdown';
import { Aviso, Card } from '../components/ui';
import { sumarDias, toISODate } from '../lib/dateRanges';

// Tablero: los 5 números clave para cualquier persona (no solo quien opera
// las rutas). Cada número dice qué cuenta y con qué operación se llegó a él,
// a la vista y sin íconos que haya que descubrir; la comparación siempre es
// contra el periodo anterior del mismo tipo, cortado en el mismo punto de
// avance (ver server/src/routes/tablero.ts).

const VISTAS: { v: VistaTablero; label: string }[] = [
  { v: 'dia', label: 'Día' }, { v: 'semana', label: 'Semana' }, { v: 'mes', label: 'Mes' },
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

function nombrePeriodo(vista: VistaTablero, desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);
  if (vista === 'dia') return `${DIAS[a.dow]} ${a.dia} de ${MESES[a.mes]}`;
  if (vista === 'mes') return `${MESES[a.mes]} ${a.anio}`;
  return a.mes === b.mes ? `semana del ${a.dia} al ${b.dia} de ${MESES[a.mes]}` : `semana del ${a.dia} de ${MESES[a.mes]} al ${b.dia} de ${MESES[b.mes]}`;
}

// "del 1 al 11 de noviembre" / "del 28 de octubre al 3 de noviembre".
function delAl(desde: string, hasta: string): string {
  const a = partes(desde);
  const b = partes(hasta);
  if (desde === hasta) return `el ${DIAS[a.dow]} ${a.dia} de ${MESES[a.mes]}`;
  return a.mes === b.mes ? `del ${a.dia} al ${b.dia} de ${MESES[a.mes]}` : `del ${a.dia} de ${MESES[a.mes]} al ${b.dia} de ${MESES[b.mes]}`;
}

// Último día que toca un periodo cortado (fin es exclusivo).
const ultimoDia = (finIso: string) => toISODate(new Date(Date.parse(finIso) - 1));

function etiquetaEje(vista: VistaTablero, desde: string): string {
  const p = partes(desde);
  if (vista === 'mes') return `${MESES_CORTO[p.mes]}${p.mes === 0 ? ` ${String(p.anio).slice(2)}` : ''}`;
  if (vista === 'semana') return `${p.dia} ${MESES_CORTO[p.mes]}`;
  return `${DIAS[p.dow].slice(0, 3)} ${p.dia}`;
}

function textoAnterior(vista: VistaTablero, desde: string): string {
  const x = partes(desde);
  if (vista === 'dia') return `el ${DIAS[x.dow].slice(0, 3)} ${x.dia} ${MESES_CORTO[x.mes]}`;
  if (vista === 'semana') return `la semana del ${x.dia} ${MESES_CORTO[x.mes]}`;
  return `en ${MESES[x.mes]}`;
}

function moverFecha(vista: VistaTablero, fecha: string, paso: number): string {
  if (vista === 'dia') return sumarDias(fecha, paso);
  if (vista === 'semana') return sumarDias(fecha, 7 * paso);
  const p = partes(fecha);
  return toISODate(new Date(p.anio, p.mes + paso, 1));
}

export function Tablero() {
  const { productos, fProductos, setFProductos } = useFilters();
  const [params, setParams] = useSearchParams();
  const hoyLocal = toISODate(new Date());
  // Vista y fecha viven en la URL: el enlace que se comparte abre el mismo periodo.
  const vista: VistaTablero = params.get('vista') === 'dia' || params.get('vista') === 'semana' ? params.get('vista') as VistaTablero : 'mes';
  const fecha = params.get('fecha') && /^\d{4}-\d{2}-\d{2}$/.test(params.get('fecha')!) ? params.get('fecha')! : hoyLocal;
  const [data, setData] = useState<TableroData | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setCargando(true);
    setError('');
    api.tablero({ vista, fecha, productoIds: fProductos })
      .then(setData)
      .catch((e) => setError(e.message || 'No se pudo cargar el tablero.'))
      .finally(() => setCargando(false));
  }, [vista, fecha, fProductos]);

  const ir = (v: VistaTablero, f: string) => setParams({ vista: v, fecha: f }, { replace: true });
  const hoy = data?.hoy ?? hoyLocal;
  const siguiente = moverFecha(vista, fecha, 1);
  const haySiguiente = (vista === 'mes' ? siguiente.slice(0, 7) <= hoy.slice(0, 7) : siguiente <= hoy);
  const enCurso = data?.enCurso ?? true;

  // "el miér 4 nov" / "la semana del 2 nov" / "en octubre": contra qué se compara cada número.
  const vsTxt = data ? textoAnterior(vista, data.anterior.desde) : 'del periodo anterior';
  const a = data?.actual;
  const p = data?.previo;
  const hs = data?.hubspot;
  const hsOk = hs?.estado === 'ok';

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></svg>}
        title="Tablero"
        subtitle="Los números clave de Visitas de Campo. Cada uno dice qué cuenta y de dónde sale."
      />

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        <MultiSelectDropdown
          label="Producto" options={productos.map((x) => ({ value: x.id, label: x.nombre }))}
          selected={fProductos} onChange={setFProductos} placeholder="Todos los productos"
        />
        <div role="tablist" aria-label="Ver por" style={{ display: 'inline-flex', border: '1px solid #d9e1db', borderRadius: 9, overflow: 'hidden', background: '#fff' }}>
          {VISTAS.map((x, i) => (
            <button
              key={x.v} role="tab" aria-selected={vista === x.v}
              onClick={() => ir(x.v, enCurso ? hoy : fecha)}
              style={{ border: 'none', borderLeft: i ? '1px solid #d9e1db' : 'none', padding: '8px 16px', fontSize: 13, fontWeight: vista === x.v ? 600 : 500, background: vista === x.v ? '#157347' : '#fff', color: vista === x.v ? '#fff' : '#3a4a41', cursor: 'pointer' }}
            >{x.label}</button>
          ))}
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', background: '#fff', border: '1px solid #d9e1db', borderRadius: 9 }}>
          <button aria-label="Periodo anterior" onClick={() => ir(vista, moverFecha(vista, fecha, -1))} style={flecha}>‹</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#263238', padding: '0 6px', minWidth: 150, textAlign: 'center' }}>
            {data ? capitalizar(nombrePeriodo(vista, data.periodo.desde, data.periodo.hasta)) : '…'}
          </span>
          <button aria-label="Periodo siguiente" disabled={!haySiguiente} onClick={() => ir(vista, siguiente > hoy ? hoy : siguiente)} style={{ ...flecha, opacity: haySiguiente ? 1 : 0.3, cursor: haySiguiente ? 'pointer' : 'default' }}>›</button>
        </div>
        {data && !enCurso && (
          <button onClick={() => ir(vista, hoy)} style={{ background: 'none', border: 'none', color: '#157347', fontWeight: 600, fontSize: 13, cursor: 'pointer' }}>
            Ir al periodo actual
          </button>
        )}
      </div>

      {data && (
        <div style={{ background: '#fff', border: '1px solid #e3eae5', borderRadius: 12, padding: '11px 16px', fontSize: 13, color: '#5a665f', marginBottom: 12, lineHeight: 1.5 }}>
          {data.enCurso ? (
            <>
              {vista === 'dia' ? 'Hoy' : capitalizar(nombrePeriodo(vista, data.periodo.desde, data.periodo.hasta))} va en curso: se muestra <b style={negro}>{delAl(data.periodo.desde, ultimoDia(data.periodo.fin))} hasta las {hora(data.periodo.fin)}</b> y
              se compara contra <b style={negro}>{delAl(data.anterior.desde, ultimoDia(data.anterior.fin))} hasta la misma hora</b>
              {vista === 'dia' ? ' (el mismo día de la semana pasada: un lunes no se parece a un sábado).' : ', el mismo avance del periodo anterior, para que la comparación sea justa aunque no haya terminado.'}
            </>
          ) : (
            <>
              Se muestra <b style={negro}>{nombrePeriodo(vista, data.periodo.desde, data.periodo.hasta)}</b> completo y se compara contra <b style={negro}>{nombrePeriodo(vista, data.anterior.desde, data.anterior.hasta)}</b> completo.
            </>
          )}
        </div>
      )}

      {error && <div style={{ marginBottom: 12 }}><Aviso tono="error">{error}</Aviso></div>}
      {hs?.estado === 'sin_configurar' && (
        <div style={{ marginBottom: 12 }}><Aviso tono="alerta">
          <b>HubSpot no está conectado.</b> Solicitudes, aprobación, conversión y confirmación aparecen en cuanto se configure <code>HUBSPOT_TOKEN</code> en el servidor. Mientras tanto se muestran las solicitudes que marcaron los vendedores en campo, sin confirmar.
        </Aviso></div>
      )}
      {hs?.estado === 'error' && (
        <div style={{ marginBottom: 12 }}><Aviso tono="error">
          <b>No se pudo consultar HubSpot en este momento</b> ({hs.mensaje}). Los números de visitas sí están al día; vuelve a cargar en unos minutos.
        </Aviso></div>
      )}
      {hsOk && hs.vendedoresSinCuenta.length > 0 && (
        <div style={{ marginBottom: 12 }}><Aviso tono="info">
          Las solicitudes de <b>{lista(hs.vendedoresSinCuenta)}</b> no se pueden confirmar: su correo no tiene usuario en HubSpot, así que cuentan como no confirmadas.
        </Aviso></div>
      )}

      <div style={{ opacity: cargando && data ? 0.55 : 1, transition: 'opacity .15s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(215px, 100%), 1fr))', gap: 14 }}>
          {hsOk || !a ? (
            <Kpi
              estrella orden="El resultado" titulo="Solicitudes" fuente="HubSpot"
              valor={num(a?.solicitudes)} delta={cambio(a?.solicitudes, p?.solicitudes, 'pct', vsTxt)}
              extra={a && a.solicitudes != null ? <Reparto a={a} /> : null}
              queCuenta="Negocios a los que el vendedor les marcó «Hizo solicitud» en la visita y que sí tienen su solicitud en HubSpot, creada por él entre 30 min antes y 30 min después. Cada negocio cuenta una vez."
            />
          ) : (
            <Kpi
              estrella orden="El resultado" titulo="Solicitudes marcadas en campo"
              valor={num(a.marcadas)} delta={cambio(a.marcadas, p?.marcadas, 'pct', vsTxt)}
              queCuenta="Visitas en las que el vendedor marcó «Hizo solicitud». Todavía sin confirmar contra HubSpot."
            />
          )}
          <Kpi
            orden="La calidad" titulo="Aprobación" fuente="HubSpot"
            valor={pctTxt(a?.aprobacion)}
            delta={a && esPreliminar(a) ? { texto: '', tono: 'neutro', contra: 'no se compara mientras sea preliminar' } : cambio(a?.aprobacion, p?.aprobacion, 'puntos', vsTxt)}
            queCuenta="De las solicitudes del periodo que ya tienen respuesta, cuántas se aprobaron."
            formula={a && a.aprobadas != null ? `${num(a.aprobadas)} aprobadas ÷ ${num(a.aprobadas + (a.rechazadas ?? 0))} con respuesta. Las ${num(a.enProceso)} en revisión todavía no cuentan.` : undefined}
            extra={a && esPreliminar(a) ? (
              <div style={{ marginTop: 8, fontSize: 11.5, color: '#94500f', background: '#fff5ea', borderRadius: 6, padding: '4px 8px' }}>
                <b>Preliminar:</b> solo {num((a.aprobadas ?? 0) + (a.rechazadas ?? 0))} de {num(a.solicitudes)} solicitudes tienen respuesta; puede cambiar mucho.
              </div>
            ) : null}
          />
          <Kpi
            orden="El alcance" titulo="Negocios visitados"
            valor={num(a?.negociosVisitados)} delta={cambio(a?.negociosVisitados, p?.negociosVisitados, 'pct', vsTxt)}
            extra={a ? <Meta a={a} /> : null}
            queCuenta="Negocios distintos a los que el equipo fue en persona; volver al mismo no suma otro. La meta son los negocios que se les planearon en la ruta para estos días."
            formula={a ? `${num(a.visitas)} visitas en total, contando las repetidas` : undefined}
          />
          <Kpi
            orden="La efectividad" titulo="Conversión a solicitud" fuente="HubSpot"
            valor={pctTxt(a?.conversion)} delta={cambio(a?.conversion, p?.conversion, 'puntos', vsTxt)}
            queCuenta="De cada 100 negocios reales que se visitaron, cuántos hicieron su solicitud."
            formula={a && a.solicitudes != null ? `${num(a.solicitudes)} solicitudes ÷ ${num(a.negociosReales)} negocios reales${a.noValidos ? ` (no cuentan ${num(a.noValidos)} cerrados o que no existen)` : ''}` : undefined}
          />
          <Kpi
            orden="La confianza en el dato" titulo="Confirmadas en HubSpot" fuente="HubSpot"
            valor={pctTxt(a?.confirmacion)} delta={cambio(a?.confirmacion, p?.confirmacion, 'puntos', vsTxt)}
            queCuenta="De las solicitudes que los vendedores marcaron en la visita, cuántas sí existen en HubSpot (a ±30 min, con el vendedor como dueño)."
            formula={a && a.confirmadasVisitas != null
              ? `${num(a.confirmadasVisitas)} de ${num(a.marcadas)} marcadas en campo${hs?.dealsSinVisita ? `. Además hay ${num(hs.dealsSinVisita)} en HubSpot de estos vendedores sin visita registrada.` : ''}`
              : undefined}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(420px, 100%), 1fr))', gap: 14, marginTop: 14 }}>
          <Card titulo="Del negocio visitado a la solicitud aprobada" subtitulo="Cómo se conectan los números de arriba">
            {a ? <Embudo a={a} hsOk={hsOk} /> : <Vacio />}
          </Card>
          <Card
            titulo={`Solicitudes ${vista === 'dia' ? 'por día' : vista === 'semana' ? 'por semana' : 'por mes'}`}
            subtitulo={hsOk ? 'Últimos 8 periodos · la parte oscura son las aprobadas' : 'Últimos 8 periodos · marcadas en campo'}
          >
            {data ? <Tendencia data={data} hsOk={hsOk} /> : <Vacio />}
          </Card>
        </div>

        {data && data.porProducto.length > 0 && (
          <Card titulo="Por producto" subtitulo="Los mismos números del periodo, separados por el producto de cada vendedor" style={{ marginTop: 14 }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
                <thead>
                  <tr>{['Producto', 'Negocios visitados', 'Meta de la ruta', 'Solicitudes', 'Conversión', 'Aprobación'].map((h, i) => (
                    <th key={h} style={{ textAlign: i ? 'right' : 'left', fontSize: 12, fontWeight: 600, color: '#6f7d75', padding: '6px 10px', borderBottom: '1px solid #eef2ee' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {data.porProducto.map((r) => (
                    <tr key={r.productoId}>
                      <td style={celda(true)}><b style={{ color: '#263238', fontWeight: 600 }}>{r.producto}</b></td>
                      <td style={celda()}>{num(r.negociosVisitados)}</td>
                      <td style={celda()}>{r.meta ? num(r.meta) : '—'}</td>
                      <td style={celda()}>{num(r.solicitudes)}</td>
                      <td style={celda()}>{pctTxt(r.conversion)}</td>
                      <td style={celda()}>
                        {pctTxt(r.aprobacion)}
                        {r.aprobadas != null && <div style={{ fontSize: 11, color: '#9aa39c' }}>de {num(r.aprobadas + (r.rechazadas ?? 0))} con respuesta</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        <div style={{ fontSize: 12, color: '#8a978f', marginTop: 14, lineHeight: 1.6 }}>
          <b style={{ color: '#6f7d75' }}>De dónde salen los datos:</b> las visitas, de lo que registran los vendedores en la app (al momento). Las solicitudes y su aprobación, de HubSpot
          (pipeline de campo; se consultan al abrir esta página, con hasta 15 min de retraso). La aprobación es el estado de hoy de las solicitudes creadas en el periodo.
          Las visitas de personas que ya no están activas siguen contando en su periodo.
        </div>
      </div>
    </div>
  );
}

// La aprobación de un periodo reciente se calcula con pocas solicitudes ya
// resueltas (la mayoría sigue en revisión): 4 de 4 aprobadas daría "100%".
const esPreliminar = (a: BloqueTablero) =>
  a.solicitudes != null && a.solicitudes > 0 && ((a.aprobadas ?? 0) + (a.rechazadas ?? 0)) * 2 < a.solicitudes;

// ---------- Piezas ----------

type Cambio = { texto: string; tono: 'bien' | 'mal' | 'neutro'; contra: string } | null;

function cambio(actual: number | null | undefined, previo: number | null | undefined, tipo: 'pct' | 'puntos', anterior: string): Cambio {
  if (actual == null) return null;
  if (previo == null || (tipo === 'pct' && previo === 0)) return { texto: '', tono: 'neutro', contra: 'sin dato del periodo anterior para comparar' };
  const contra = `vs ${tipo === 'pct' ? num(previo) : pctTxt(previo)} ${anterior}`;
  const d = tipo === 'pct' ? Math.round(((actual - previo) / previo) * 100) : Math.round((actual - previo) * 10) / 10;
  if (d === 0) return { texto: 'Igual', tono: 'neutro', contra };
  const valor = tipo === 'pct' ? `${Math.abs(d)}%` : `${Math.abs(d).toLocaleString('es-MX')} ${Math.abs(d) === 1 ? 'punto' : 'puntos'}`;
  return { texto: `${d > 0 ? '▲' : '▼'} ${valor}`, tono: d > 0 ? 'bien' : 'mal', contra };
}

function Kpi({ orden, titulo, fuente, valor, delta, extra, queCuenta, formula, estrella }: {
  orden: string; titulo: string; fuente?: string; valor: ReactNode; delta: Cambio; extra?: ReactNode; queCuenta: string; formula?: string; estrella?: boolean;
}) {
  const color = delta?.tono === 'bien' ? '#1c7a4f' : delta?.tono === 'mal' ? '#b23a2b' : '#6f7d75';
  return (
    <section style={{ background: '#fff', border: estrella ? '1.5px solid #157347' : '1px solid #e3eae5', borderRadius: 14, padding: '16px 18px 14px', display: 'flex', flexDirection: 'column', boxShadow: estrella ? '0 2px 10px rgba(21,115,71,.08)' : undefined }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#157347', letterSpacing: '.04em', textTransform: 'uppercase' }}>{orden}</div>
      <h2 style={{ margin: '4px 0 0', fontSize: 14.5, fontWeight: 600, color: '#263238', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        {titulo}
        {fuente && <span style={{ fontSize: 10.5, fontWeight: 700, color: '#b2431f', background: '#fff0eb', borderRadius: 999, padding: '1px 7px' }}>{fuente}</span>}
      </h2>
      <div style={{ fontSize: 36, fontWeight: 600, color: '#1f2a24', lineHeight: 1.1, marginTop: 10, fontVariantNumeric: 'tabular-nums' }}>{valor}</div>
      {delta && (
        <div style={{ fontSize: 12.5, marginTop: 6 }}>
          {delta.texto && <b style={{ color, fontWeight: 600 }}>{delta.texto} </b>}
          <span style={{ color: '#8a978f' }}>{delta.contra}</span>
        </div>
      )}
      {extra}
      <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed #e3eae5', fontSize: 12, color: '#4f5c55', lineHeight: 1.45, flex: 1 }}>
        <b style={{ color: '#263238', fontWeight: 600 }}>Qué cuenta:</b> {queCuenta}
        {formula && <div style={{ marginTop: 6, fontSize: 11.5, color: '#8a978f' }}>{formula}</div>}
      </div>
    </section>
  );
}

function Reparto({ a }: { a: BloqueTablero }) {
  return (
    <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 8, fontSize: 12, color: '#5a665f' }}>
      <span><b style={{ color: '#1c7a4f' }}>{num(a.aprobadas)}</b> aprobadas</span>
      <span><b style={{ color: '#b23a2b' }}>{num(a.rechazadas)}</b> rechazadas</span>
      <span><b style={{ color: '#3a4a41' }}>{num(a.enProceso)}</b> en revisión</span>
    </div>
  );
}

function Meta({ a }: { a: BloqueTablero }) {
  if (!a.meta) return <div style={{ fontSize: 11.5, color: '#8a978f', marginTop: 10 }}>Sin ruta planeada para estos días</div>;
  const pct = Math.round((a.negociosVisitados / a.meta) * 100);
  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ height: 6, background: '#edf1ee', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct)}%`, background: '#157347', borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 11.5, color: '#6f7d75', marginTop: 4 }}>
        <b style={{ color: '#263238' }}>{pct}%</b> de la meta de la ruta: {num(a.meta)} negocios
      </div>
    </div>
  );
}

function Embudo({ a, hsOk }: { a: BloqueTablero; hsOk: boolean }) {
  const de = (x: number | null, y: number) => (x != null && y > 0 ? `${Math.round((x / y) * 100)}%` : '—');
  const pasos: { n: number | null; l: string; p: string; final?: boolean }[] = [
    { n: a.negociosVisitados, l: 'Negocios visitados', p: 'distintos, en persona' },
    { n: a.negociosReales, l: 'Negocios reales', p: `${de(a.negociosReales, a.negociosVisitados)} · sin cerrados ni inexistentes` },
    { n: a.interesados, l: 'Mostraron interés', p: `${de(a.interesados, a.negociosReales)} de los reales · solicitud, información o volver otro día` },
    hsOk
      ? { n: a.solicitudes, l: 'Hicieron solicitud', p: `${de(a.solicitudes, a.negociosReales)} de los reales · confirmada en HubSpot` }
      : { n: a.marcadas, l: 'Solicitudes marcadas', p: 'en campo, sin confirmar' },
  ];
  if (hsOk) pasos.push({ n: a.aprobadas, l: 'Aprobadas', p: `${a.aprobacion != null ? pctTxt(a.aprobacion) : '—'} de las que ya tienen respuesta · ${num(a.enProceso)} en revisión`, final: true });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {pasos.map((s, i) => {
        const ancho = a.negociosVisitados ? Math.max(4, ((s.n ?? 0) / a.negociosVisitados) * 100) : 0;
        return (
          <div key={s.l} style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 70px', alignItems: 'center', gap: 12 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5 }}>
                <span style={{ fontWeight: 600, color: '#263238' }}>{s.l}</span>
                <span style={{ color: '#8a978f', textAlign: 'right' }}>{s.p}</span>
              </div>
              <div style={{ height: 10, background: '#f1f4f2', borderRadius: 3, marginTop: 4 }}>
                <div style={{ height: '100%', width: `${ancho}%`, background: s.final ? '#0d3d24' : i === pasos.length - 1 || (i === 3 && hsOk) ? '#157347' : '#7cc49c', borderRadius: 3 }} />
              </div>
            </div>
            <div style={{ fontSize: 20, fontWeight: 600, color: '#1f2a24', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{num(s.n)}</div>
          </div>
        );
      })}
    </div>
  );
}

function Tendencia({ data, hsOk }: { data: TableroData; hsOk: boolean }) {
  const [hover, setHover] = useState<number | null>(null);
  const serie = data.tendencia.map((t) => ({ ...t, total: (hsOk ? t.solicitudes : t.marcadas) ?? 0, aprob: hsOk ? t.aprobadas ?? 0 : 0 }));
  const max = Math.max(1, ...serie.map((s) => s.total));
  const alto = 170;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, height: alto, borderBottom: '1px solid #cfd8d2', paddingTop: 22 }}>
        {serie.map((s, i) => {
          const h = (s.total / max) * (alto - 22);
          return (
            <div key={s.desde} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', position: 'relative' }}>
              <span style={{ fontSize: 11.5, fontWeight: 600, color: '#3a4a41', marginBottom: 3, fontVariantNumeric: 'tabular-nums' }}>{s.total || ''}</span>
              <div style={{
                width: '62%', maxWidth: 34, height: h, minHeight: s.total ? 2 : 0, borderRadius: '4px 4px 0 0', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                background: s.parcial ? 'repeating-linear-gradient(135deg, #b9dfc8 0 4px, #d8eee1 4px 8px)' : '#9fd0b4',
                outline: hover === i ? '2px solid #0d3d24' : 'none',
              }}>
                {hsOk && <div style={{ height: s.total ? `${(s.aprob / s.total) * 100}%` : 0, background: '#157347' }} />}
              </div>
              {hover === i && (
                <div style={{ position: 'absolute', bottom: h + 26, left: '50%', transform: 'translateX(-50%)', background: '#1f2a24', color: '#fff', borderRadius: 8, padding: '7px 10px', whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none', fontSize: 12 }}>
                  <div style={{ fontWeight: 700, fontSize: 13 }}>{s.total} {hsOk ? 'solicitudes' : 'marcadas en campo'}</div>
                  {hsOk && <div>{s.aprob} aprobadas · {s.rechazadas ?? 0} rechazadas</div>}
                  <div style={{ color: '#c5d6cb' }}>{capitalizar(nombrePeriodo(data.vista, s.desde, s.hasta))}{s.parcial ? ' · en curso' : ''}</div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 5 }}>
        {serie.map((s) => (
          <span key={s.desde} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: s.parcial ? '#157347' : '#8a978f', fontWeight: s.parcial ? 600 : 400, whiteSpace: 'nowrap' }}>
            {etiquetaEje(data.vista, s.desde)}{s.parcial ? '*' : ''}
          </span>
        ))}
      </div>
      {serie.some((s) => s.parcial) && <div style={{ fontSize: 11.5, color: '#8a978f', marginTop: 8 }}>* En curso: todavía no termina.</div>}
    </div>
  );
}

const Vacio = () => <div style={{ padding: 20, color: '#9aa39c', fontSize: 13, textAlign: 'center' }}>Cargando…</div>;

const capitalizar = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const lista = (n: string[]) => (n.length <= 3 ? n.join(', ') : `${n.slice(0, 3).join(', ')} y ${n.length - 3} más`);
const negro: React.CSSProperties = { color: '#263238', fontWeight: 600 };
const flecha: React.CSSProperties = { background: 'none', border: 'none', fontSize: 18, lineHeight: 1, color: '#3a4a41', padding: '6px 10px', cursor: 'pointer' };
const celda = (izq = false): React.CSSProperties => ({ textAlign: izq ? 'left' : 'right', padding: '9px 10px', borderBottom: '1px solid #f2f5f2', fontVariantNumeric: 'tabular-nums', color: '#3a4a41' });

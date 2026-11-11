import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { chunkArray, parseCsvParam } from '../firestore-helpers.js';
import { esFechaIso, fechaMx, hoyMx, inicioDiaMx, sumarDias, diaSemana } from '../fechas.js';
import { getVendedoresDocs, resolveVendedorIds } from './_filters.js';
import { planeadosEnRango, type PlaneadoMetrica } from './metricas.js';
import { productosPorId, type VendedorDoc } from './vendedores.js';
import { dealsDeCampo, hubspotConfigurado, ownersPorEmail, type DealCampo } from '../integrations/hubspot.js';

// Tablero: los 5 números clave para cualquier persona que quiera ver el
// resultado de campo sin conocer la operación. Todo se calcula para un
// periodo (día, semana o mes) y se compara contra el periodo anterior del
// mismo tipo cortado en el mismo punto de avance (ver periodos()).
export const tableroRouter = Router();

const SOLICITUD = 'Se realizó solicitud';
const NO_VALIDO = 'No es un negocio válido o existente';
const CON_INTERES = new Set([SOLICITUD, 'Se dejó información', 'Se reagenda visita']);
// Una solicitud marcada en la visita se da por confirmada si el vendedor
// tiene un deal en HubSpot creado hasta 30 min antes o después.
const VENTANA_CONFIRMACION_MS = 30 * 60 * 1000;
const PERIODOS_TENDENCIA = 8;

type Vista = 'dia' | 'semana' | 'mes';

interface VisitaTablero {
  id: string;
  vendedorId: string;
  resultado: string;
  createdAt: number;
  negocio: string;
}

// ---------- Periodos ----------

function sumarMeses(primeroDeMes: string, n: number): string {
  const [y, m] = primeroDeMes.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 10);
}

function inicioDe(vista: Vista, fecha: string): string {
  if (vista === 'dia') return fecha;
  if (vista === 'semana') { const dow = diaSemana(fecha); return sumarDias(fecha, dow === 0 ? -6 : 1 - dow); }
  return `${fecha.slice(0, 7)}-01`;
}

function finDe(vista: Vista, inicio: string): string {
  if (vista === 'dia') return inicio;
  if (vista === 'semana') return sumarDias(inicio, 6);
  return sumarDias(sumarMeses(inicio, 1), -1);
}

// Inicio del periodo `n` pasos antes (paso de la tendencia: el día, la
// semana o el mes inmediato anterior).
function inicioAnterior(vista: Vista, inicio: string, n = 1): string {
  if (vista === 'dia') return sumarDias(inicio, -n);
  if (vista === 'semana') return sumarDias(inicio, -7 * n);
  return sumarMeses(inicio, -n);
}

interface Rango { desde: string; hasta: string; start: number; end: number }

function rango(desde: string, hasta: string, corte?: number): Rango {
  const start = inicioDiaMx(desde).getTime();
  const fin = inicioDiaMx(sumarDias(hasta, 1)).getTime();
  return { desde, hasta, start, end: corte != null ? Math.min(fin, corte) : fin };
}

// El periodo elegido y contra qué se compara:
// - Día: contra el mismo día de la semana pasada (un lunes no se parece a
//   un sábado, así que "contra ayer" engañaría).
// - Semana y mes: contra la semana / el mes anterior.
// Si el periodo va en curso, los dos se cortan en el mismo punto de avance:
// hoy hasta esta hora vs el martes pasado hasta esta hora; del 1 al 11 a
// las 13:40 vs del 1 al 11 del mes pasado a las 13:40.
export function periodos(vista: Vista, fecha: string, ahora: number) {
  const desde = inicioDe(vista, fecha);
  const hasta = finDe(vista, desde);
  const completo = rango(desde, hasta);
  const enCurso = ahora >= completo.start && ahora < completo.end;
  const actual = enCurso ? rango(desde, hasta, ahora) : completo;

  const prevDesde = vista === 'dia' ? sumarDias(desde, -7) : inicioAnterior(vista, desde);
  const prevHasta = finDe(vista, prevDesde);
  const prevCompleto = rango(prevDesde, prevHasta);
  const previo = enCurso ? rango(prevDesde, prevHasta, prevCompleto.start + (ahora - completo.start)) : prevCompleto;

  const tendencia: (Rango & { parcial: boolean })[] = [];
  for (let i = PERIODOS_TENDENCIA - 1; i >= 0; i--) {
    const d = inicioAnterior(vista, desde, i);
    tendencia.push({ ...(i === 0 ? actual : rango(d, finDe(vista, d))), parcial: i === 0 && enCurso });
  }
  return { actual, previo, enCurso, tendencia };
}

// Último día de calendario que toca un rango (para las paradas planeadas,
// que se guardan por día).
const ultimoDia = (r: Rango) => fechaMx(new Date(r.end - 1));

// ---------- Lecturas ----------

async function visitasEnRango(ids: string[] | null, r: Rango, soloSolicitudes = false): Promise<VisitaTablero[]> {
  const campos = ['vendedorId', 'resultado', 'createdAt', 'negocioId', 'prospectoId'];
  const base = (q: FirebaseFirestore.Query) => {
    let x = q;
    if (soloSolicitudes) x = x.where('resultado', '==', SOLICITUD);
    return x.where('createdAt', '>=', Timestamp.fromMillis(r.start)).where('createdAt', '<', Timestamp.fromMillis(r.end)).select(...campos);
  };
  const consultas = ids ? chunkArray(ids).map((c) => db.collection('visitas').where('vendedorId', 'in', c)) : [db.collection('visitas')];
  const snaps = await Promise.all(consultas.map((q) => base(q).get()));
  return snaps.flatMap((s) => s.docs.map((d) => {
    const v = d.data() as { vendedorId: string; resultado: string; createdAt: Timestamp; negocioId?: string | null; prospectoId?: string | null };
    return { id: d.id, vendedorId: v.vendedorId, resultado: v.resultado, createdAt: v.createdAt.toMillis(), negocio: v.negocioId || v.prospectoId || `visita:${d.id}` };
  }));
}

// ---------- Confirmación contra HubSpot ----------

// Empareja cada visita marcada como "Hizo solicitud" con un deal del mismo
// vendedor creado a ±30 min. Se arman todas las parejas posibles y se
// asignan de la más cercana a la más lejana; cada deal y cada visita se usan
// una sola vez (dos solicitudes seguidas no pueden confirmarse con el mismo
// deal).
export function emparejar(solicitudes: VisitaTablero[], deals: DealCampo[], ownerDe: Map<string, string>): Map<string, DealCampo> {
  const dealsPorOwner = new Map<string, DealCampo[]>();
  for (const d of deals) {
    const l = dealsPorOwner.get(d.ownerId) ?? [];
    l.push(d);
    dealsPorOwner.set(d.ownerId, l);
  }
  const parejas: { visita: string; deal: DealCampo; delta: number }[] = [];
  for (const v of solicitudes) {
    const owner = ownerDe.get(v.vendedorId);
    if (!owner) continue;
    for (const d of dealsPorOwner.get(owner) ?? []) {
      const delta = Math.abs(d.creado - v.createdAt);
      if (delta <= VENTANA_CONFIRMACION_MS) parejas.push({ visita: v.id, deal: d, delta });
    }
  }
  parejas.sort((a, b) => a.delta - b.delta);
  const porVisita = new Map<string, DealCampo>();
  const usados = new Set<string>();
  for (const p of parejas) {
    if (porVisita.has(p.visita) || usados.has(p.deal.id)) continue;
    porVisita.set(p.visita, p.deal);
    usados.add(p.deal.id);
  }
  return porVisita;
}

type EstadoDeal = 'aprobada' | 'rechazada' | 'en_proceso';
function estadoDeal(d: DealCampo): EstadoDeal {
  // Si pasó por las dos etapas, manda la más reciente.
  if (d.aprobado != null && (d.rechazado == null || d.aprobado >= d.rechazado)) return 'aprobada';
  if (d.rechazado != null) return 'rechazada';
  return 'en_proceso';
}

const pct1 = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);

// ---------- Cálculo por periodo ----------

interface Contexto {
  hubspotOk: boolean;
  confirmadas: Map<string, DealCampo>; // visitaId → deal
}

function solicitudesDe(solicitudes: VisitaTablero[], ctx: Contexto) {
  // Cada negocio cuenta una vez: si se le marcó solicitud dos veces, vale
  // la primera confirmada.
  const porNegocio = new Map<string, DealCampo>();
  let confirmadasVisitas = 0;
  for (const v of [...solicitudes].sort((a, b) => a.createdAt - b.createdAt)) {
    const deal = ctx.confirmadas.get(v.id);
    if (!deal) continue;
    confirmadasVisitas++;
    if (!porNegocio.has(v.negocio)) porNegocio.set(v.negocio, deal);
  }
  const estados = [...porNegocio.values()].map(estadoDeal);
  const aprobadas = estados.filter((e) => e === 'aprobada').length;
  const rechazadas = estados.filter((e) => e === 'rechazada').length;
  return {
    marcadas: solicitudes.length,
    confirmadasVisitas: ctx.hubspotOk ? confirmadasVisitas : null,
    solicitudes: ctx.hubspotOk ? porNegocio.size : null,
    aprobadas: ctx.hubspotOk ? aprobadas : null,
    rechazadas: ctx.hubspotOk ? rechazadas : null,
    enProceso: ctx.hubspotOk ? porNegocio.size - aprobadas - rechazadas : null,
  };
}

function bloque(visitas: VisitaTablero[], solicitudes: VisitaTablero[], planeados: PlaneadoMetrica[], ctx: Contexto) {
  // Por negocio, el resultado de su última visita del periodo dice si era
  // un negocio real; con que alguna visita haya mostrado interés, cuenta
  // como interesado.
  const ultima = new Map<string, VisitaTablero>();
  const interesados = new Set<string>();
  for (const v of visitas) {
    const u = ultima.get(v.negocio);
    if (!u || v.createdAt > u.createdAt) ultima.set(v.negocio, v);
    if (CON_INTERES.has(v.resultado)) interesados.add(v.negocio);
  }
  const negociosVisitados = ultima.size;
  const noValidos = [...ultima.values()].filter((v) => v.resultado === NO_VALIDO).length;
  const negociosReales = negociosVisitados - noValidos;
  const s = solicitudesDe(solicitudes, ctx);
  return {
    visitas: visitas.length,
    negociosVisitados,
    negociosReales,
    noValidos,
    interesados: interesados.size,
    meta: planeados.length,
    metaVisitados: planeados.filter((p) => p.estado === 'visitado').length,
    ...s,
    conversion: s.solicitudes != null ? pct1(s.solicitudes, negociosReales) : null,
    aprobacion: s.aprobadas != null ? pct1(s.aprobadas, s.aprobadas + (s.rechazadas ?? 0)) : null,
    confirmacion: s.confirmadasVisitas != null ? pct1(s.confirmadasVisitas, s.marcadas) : null,
  };
}

// ---------- Ruta ----------

tableroRouter.get('/', async (req, res) => {
  const q = req.query as { vista?: string; fecha?: string; productoIds?: string };
  const vista: Vista = q.vista === 'dia' || q.vista === 'semana' ? q.vista : 'mes';
  const hoy = hoyMx();
  // No se puede ver el futuro: una fecha posterior a hoy se trata como hoy.
  const fecha = esFechaIso(q.fecha) && q.fecha <= hoy ? q.fecha : hoy;
  const ahora = Date.now();
  const { actual, previo, enCurso, tendencia } = periodos(vista, fecha, ahora);

  const filtro = await resolveVendedorIds(undefined, parseCsvParam(q.productoIds));
  const vendedoresDocs = await getVendedoresDocs(filtro);
  const vendedores = vendedoresDocs.map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }));
  const ids = vendedores.map((v) => v.id);
  const idsSet = new Set(ids);
  // Sin filtro de producto se lee por fecha (una sola consulta); las
  // solicitudes sí van por vendedor para usar el índice vendedor+resultado+fecha.
  const idsConsulta = filtro ? ids : null;

  const rangoTendencia: Rango = { desde: tendencia[0].desde, hasta: actual.hasta, start: tendencia[0].start, end: actual.end };
  const [visitasAct, visitasPrev, solicitudesTodas, planAct, planPrev] = ids.length === 0
    ? [[], [], [], [], []] as [VisitaTablero[], VisitaTablero[], VisitaTablero[], PlaneadoMetrica[], PlaneadoMetrica[]]
    : await Promise.all([
      visitasEnRango(idsConsulta, actual),
      visitasEnRango(idsConsulta, previo),
      visitasEnRango(ids, rangoTendencia, true),
      planeadosEnRango(actual.desde, ultimoDia(actual), idsSet),
      planeadosEnRango(previo.desde, ultimoDia(previo), idsSet),
    ]);
  const solo = <T extends { vendedorId: string }>(l: T[]) => l.filter((v) => idsSet.has(v.vendedorId));
  const solicitudes = solo(solicitudesTodas);

  // HubSpot: dueño del deal = vendedor con el mismo correo.
  const ownerDe = new Map<string, string>();
  let hubspot: { estado: 'ok' | 'sin_configurar' | 'error'; mensaje?: string; dealsSinVisita: number | null; vendedoresSinCuenta: string[] } = {
    estado: hubspotConfigurado() ? 'ok' : 'sin_configurar', dealsSinVisita: null, vendedoresSinCuenta: [],
  };
  let confirmadas = new Map<string, DealCampo>();
  if (hubspot.estado === 'ok' && ids.length) {
    try {
      const owners = await ownersPorEmail();
      for (const v of vendedores) {
        const owner = v.email ? owners.get(v.email.trim().toLowerCase()) : undefined;
        if (owner) ownerDe.set(v.id, owner);
      }
      // Solo importa quién no tiene cuenta si tuvo solicitudes en el periodo.
      const conSolicitud = new Set(solicitudes.filter((s) => s.createdAt >= actual.start).map((s) => s.vendedorId));
      hubspot.vendedoresSinCuenta = vendedores.filter((v) => conSolicitud.has(v.id) && !ownerDe.has(v.id)).map((v) => v.nombre);
      const deals = await dealsDeCampo([...ownerDe.values()], new Date(rangoTendencia.start - VENTANA_CONFIRMACION_MS), new Date(rangoTendencia.end + VENTANA_CONFIRMACION_MS));
      confirmadas = emparejar(solicitudes, deals, ownerDe);
      const usados = new Set([...confirmadas.values()].map((d) => d.id));
      hubspot.dealsSinVisita = deals.filter((d) => d.creado >= actual.start && d.creado < actual.end && !usados.has(d.id)).length;
    } catch (err) {
      console.error('Tablero: HubSpot falló:', err);
      hubspot = { estado: 'error', mensaje: (err as Error).message, dealsSinVisita: null, vendedoresSinCuenta: [] };
    }
  }
  const ctx: Contexto = { hubspotOk: hubspot.estado === 'ok', confirmadas };
  const enRango = (l: VisitaTablero[], r: Rango) => l.filter((v) => v.createdAt >= r.start && v.createdAt < r.end);

  const act = solo(visitasAct);
  const solAct = enRango(solicitudes, actual);

  // Por producto (el producto actual de cada vendedor).
  const productoDe = new Map(vendedores.map((v) => [v.id, v.productoId]));
  const nombresProducto = await productosPorId(vendedores.map((v) => v.productoId));
  const productosConDatos = [...new Set([...act, ...planAct].map((x) => productoDe.get(x.vendedorId) ?? ''))].filter(Boolean);
  const porProducto = productosConDatos.map((pid) => {
    const de = <T extends { vendedorId: string }>(l: T[]) => l.filter((x) => productoDe.get(x.vendedorId) === pid);
    const b = bloque(de(act), de(solAct), de(planAct), ctx);
    return {
      productoId: pid, producto: nombresProducto.get(pid) ?? '—',
      negociosVisitados: b.negociosVisitados, meta: b.meta, solicitudes: b.solicitudes, conversion: b.conversion, aprobacion: b.aprobacion,
      aprobadas: b.aprobadas, rechazadas: b.rechazadas,
    };
  }).sort((a, b) => (b.solicitudes ?? 0) - (a.solicitudes ?? 0) || b.negociosVisitados - a.negociosVisitados);

  const describir = (r: Rango) => ({ desde: r.desde, hasta: r.hasta, inicio: new Date(r.start).toISOString(), fin: new Date(r.end).toISOString() });

  res.json({
    vista, hoy, enCurso,
    periodo: describir(actual),
    anterior: describir(previo),
    actual: bloque(act, solAct, planAct, ctx),
    previo: bloque(solo(visitasPrev), enRango(solicitudes, previo), planPrev, ctx),
    hubspot,
    porProducto,
    tendencia: tendencia.map((r) => {
      const s = solicitudesDe(enRango(solicitudes, r), ctx);
      return { desde: r.desde, hasta: r.hasta, parcial: r.parcial, marcadas: s.marcadas, solicitudes: s.solicitudes, aprobadas: s.aprobadas, rechazadas: s.rechazadas };
    }),
  });
});

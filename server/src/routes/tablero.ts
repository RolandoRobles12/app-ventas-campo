import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { chunkArray, parseCsvParam } from '../firestore-helpers.js';
import { diasEntre, esFechaIso, fechaMx, hoyMx, inicioDiaMx, sumarDias, diaSemana } from '../fechas.js';
import { getVendedoresDocs, resolveVendedorIds } from './_filters.js';
import { productosPorId, type VendedorDoc } from './vendedores.js';
import { configGuardada } from '../rutas/planificador.js';
import { dealsDeCampo, hubspotConfigurado, ownersPorEmail, type DealCampo } from '../integrations/hubspot.js';

// Tablero: el embudo de campo (meta de la ruta → visitados → reales → con
// interés → solicitudes en HubSpot → aprobadas) para cualquier persona que
// quiera ver el resultado sin conocer la operación, más el detalle por
// vendedor y las alertas para quien coordina. Todo se calcula para un
// periodo (día, semana, mes o un rango a elegir) y se compara contra el
// periodo anterior cortado en el mismo punto de avance (ver periodos()).
export const tableroRouter = Router();

const SOLICITUD = 'Se realizó solicitud';
const NO_VALIDO = 'No es un negocio válido o existente';
const CON_INTERES = new Set([SOLICITUD, 'Se dejó información', 'Se reagenda visita']);
// Una solicitud marcada en la visita se da por confirmada si el vendedor
// tiene un deal en HubSpot creado hasta 30 min antes o después.
const VENTANA_CONFIRMACION_MS = 30 * 60 * 1000;
const PERIODOS_TENDENCIA = 8;
// Un rango a elegir llega hasta un año; hasta 45 días la tendencia va por
// día, más largo, por semana.
const MAX_DIAS_RANGO = 366;
const MAX_DIAS_SERIE_DIARIA = 45;

type Vista = 'dia' | 'semana' | 'mes' | 'rango';

interface VisitaTablero {
  id: string;
  vendedorId: string;
  resultado: string;
  createdAt: number;
  negocio: string;
  ubicacionValida: boolean | null;
  // Si no se pudo comprobar que estuvo en el negocio, por qué (ver motivoSinComprobar()).
  sinComprobar: MotivoSinComprobar | null;
  // Negocio que el vendedor encontró en la calle, y si cuenta para su meta
  // de propios (no cuenta si ya era de alguien).
  nuevo: boolean;
  propio: boolean;
}

// Una visita solo se puede comprobar si la tablet mandó GPS y el negocio
// tiene una ubicación que no salió del propio vendedor (la del DENUE):
// - nuevo: negocio que el vendedor registró en campo; su única ubicación es
//   el GPS de esa misma visita, así que compararla consigo misma siempre
//   daría "sí estuvo" (inflaría el número).
// - sin_gps: la tablet no mandó ubicación al guardar.
// - sin_ubicacion: negocio de la ruta agregado a mano en el planeador, con
//   dirección escrita pero sin coordenadas.
type MotivoSinComprobar = 'nuevo' | 'sin_gps' | 'sin_ubicacion';
function motivoSinComprobar(v: { ubicacionValida?: boolean | null; esNegocioNuevo?: boolean; gpsAccuracy?: number | null }): MotivoSinComprobar | null {
  if (v.ubicacionValida != null) return null;
  if (v.esNegocioNuevo) return 'nuevo';
  return v.gpsAccuracy == null ? 'sin_gps' : 'sin_ubicacion';
}

export interface PlaneadoMetrica {
  vendedorId: string;
  estado: string;
  fechaPlan: string;
}

// ---------- Periodos ----------

function sumarMeses(primeroDeMes: string, n: number): string {
  const [y, m] = primeroDeMes.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 10);
}

const lunesDe = (fecha: string) => { const dow = diaSemana(fecha); return sumarDias(fecha, dow === 0 ? -6 : 1 - dow); };

function inicioDe(vista: Exclude<Vista, 'rango'>, fecha: string): string {
  if (vista === 'dia') return fecha;
  if (vista === 'semana') return lunesDe(fecha);
  return `${fecha.slice(0, 7)}-01`;
}

function finDe(vista: Exclude<Vista, 'rango'>, inicio: string): string {
  if (vista === 'dia') return inicio;
  if (vista === 'semana') return sumarDias(inicio, 6);
  return sumarDias(sumarMeses(inicio, 1), -1);
}

// Inicio del periodo `n` pasos antes (el día, la semana o el mes anterior).
function inicioAnterior(vista: Exclude<Vista, 'rango'>, inicio: string, n = 1): string {
  if (vista === 'dia') return sumarDias(inicio, -n);
  if (vista === 'semana') return sumarDias(inicio, -7 * n);
  return sumarMeses(inicio, -n);
}

interface Rango { desde: string; hasta: string; start: number; end: number }
type Tramo = Rango & { parcial: boolean };

function rango(desde: string, hasta: string, corte?: number): Rango {
  const start = inicioDiaMx(desde).getTime();
  const fin = inicioDiaMx(sumarDias(hasta, 1)).getTime();
  return { desde, hasta, start, end: corte != null ? Math.min(fin, corte) : fin };
}

// El periodo elegido, contra qué se compara y los tramos de la tendencia:
// - Día: contra el mismo día de la semana pasada (un lunes no se parece a
//   un sábado, así que "contra ayer" engañaría).
// - Semana y mes: contra la semana / el mes anterior.
// - Rango a elegir: contra los mismos días justo antes.
// Si el periodo va en curso, los dos se cortan en el mismo punto de avance
// (hoy hasta esta hora vs el martes pasado hasta esta hora; del 1 al 11 a
// las 13:40 vs del 1 al 11 del mes pasado a las 13:40).
// La tendencia son los últimos 8 días / semanas / meses; en un rango, los
// días (o semanas) que lo forman.
export function periodos(vista: Vista, desdeQ: string, hastaQ: string, ahora: number) {
  let desde: string;
  let hasta: string;
  let prevDesde: string;
  let prevHasta: string;
  if (vista === 'rango') {
    desde = desdeQ;
    hasta = hastaQ;
    const largo = diasEntre(desde, hasta) + 1;
    prevDesde = sumarDias(desde, -largo);
    prevHasta = sumarDias(desde, -1);
  } else {
    desde = inicioDe(vista, desdeQ);
    hasta = finDe(vista, desde);
    prevDesde = vista === 'dia' ? sumarDias(desde, -7) : inicioAnterior(vista, desde);
    prevHasta = finDe(vista, prevDesde);
  }
  const completo = rango(desde, hasta);
  const enCurso = ahora >= completo.start && ahora < completo.end;
  const actual = enCurso ? rango(desde, hasta, ahora) : completo;
  const prevCompleto = rango(prevDesde, prevHasta);
  const previo = enCurso ? rango(prevDesde, prevHasta, prevCompleto.start + (ahora - completo.start)) : prevCompleto;

  const tendencia: Tramo[] = [];
  let tendenciaPor: 'dia' | 'semana' | 'mes' = vista === 'rango' ? 'dia' : vista;
  if (vista === 'rango') {
    tendenciaPor = diasEntre(desde, hasta) + 1 > MAX_DIAS_SERIE_DIARIA ? 'semana' : 'dia';
    for (let d = tendenciaPor === 'semana' ? lunesDe(desde) : desde; d <= hasta; d = sumarDias(d, tendenciaPor === 'semana' ? 7 : 1)) {
      const fin = tendenciaPor === 'semana' ? sumarDias(d, 6) : d;
      const r = rango(d < desde ? desde : d, fin > hasta ? hasta : fin, actual.end);
      if (r.start >= actual.end) break;
      tendencia.push({ ...r, desde: d, parcial: enCurso && r.end === actual.end });
    }
  } else {
    for (let i = PERIODOS_TENDENCIA - 1; i >= 0; i--) {
      const d = inicioAnterior(vista, desde, i);
      tendencia.push({ ...(i === 0 ? actual : rango(d, finDe(vista, d))), parcial: i === 0 && enCurso });
    }
  }
  return { actual, previo, enCurso, tendencia, tendenciaPor };
}

// Último día de calendario que toca un rango (las paradas planeadas se
// guardan por día).
const ultimoDia = (r: Rango) => fechaMx(new Date(r.end - 1));

// ---------- Lecturas ----------

async function visitasEnRango(ids: string[] | null, r: { start: number; end: number }, soloSolicitudes = false): Promise<VisitaTablero[]> {
  const campos = ['vendedorId', 'resultado', 'createdAt', 'negocioId', 'prospectoId', 'ubicacionValida', 'esNegocioNuevo', 'propio', 'gpsAccuracy'];
  const base = (q: FirebaseFirestore.Query) => {
    const x = soloSolicitudes ? q.where('resultado', '==', SOLICITUD) : q;
    return x.where('createdAt', '>=', Timestamp.fromMillis(r.start)).where('createdAt', '<', Timestamp.fromMillis(r.end)).select(...campos);
  };
  const consultas = ids ? chunkArray(ids).map((c) => db.collection('visitas').where('vendedorId', 'in', c)) : [db.collection('visitas')];
  const snaps = await Promise.all(consultas.map((q) => base(q).get()));
  return snaps.flatMap((s) => s.docs.map((d) => {
    const v = d.data() as {
      vendedorId: string; resultado: string; createdAt: Timestamp; negocioId?: string | null; prospectoId?: string | null;
      ubicacionValida?: boolean | null; esNegocioNuevo?: boolean; propio?: boolean; gpsAccuracy?: number | null;
    };
    return {
      id: d.id, vendedorId: v.vendedorId, resultado: v.resultado, createdAt: v.createdAt.toMillis(),
      negocio: v.negocioId || v.prospectoId || `visita:${d.id}`, ubicacionValida: v.ubicacionValida ?? null,
      sinComprobar: motivoSinComprobar(v),
      nuevo: !!v.esNegocioNuevo, propio: !!v.esNegocioNuevo && v.propio !== false,
    };
  }));
}

// Cuántas visitas hubo en un rango (agregación: no lee los documentos).
async function contarVisitas(ids: string[] | null, r: Rango): Promise<number> {
  const consultas = ids ? chunkArray(ids).map((c) => db.collection('visitas').where('vendedorId', 'in', c)) : [db.collection('visitas')];
  const snaps = await Promise.all(consultas.map((q) => q
    .where('createdAt', '>=', Timestamp.fromMillis(r.start)).where('createdAt', '<', Timestamp.fromMillis(r.end)).count().get()));
  return snaps.reduce((s, x) => s + x.data().count, 0);
}

// Negocios que la ruta planeó para el periodo (la meta). Se lee por fecha
// (un solo rango) y se filtra el vendedor en memoria.
async function planeadosEnRango(desde: string, hasta: string, ids: Set<string>): Promise<PlaneadoMetrica[]> {
  if (desde > hasta) return [];
  const snap = await db.collection('prospectos')
    .where('fechaPlan', '>=', desde).where('fechaPlan', '<=', hasta)
    .select('vendedorId', 'estado', 'fechaPlan').get();
  return snap.docs.map((d) => d.data() as PlaneadoMetrica).filter((p) => ids.has(p.vendedorId));
}

// ---------- Confirmación contra HubSpot ----------

// Empareja cada visita marcada como "Hizo solicitud" con un deal del mismo
// vendedor creado a ±30 min. Se arman todas las parejas posibles y se
// asignan de la más cercana a la más lejana; cada deal y cada visita se usan
// una sola vez (dos solicitudes seguidas no pueden confirmarse con el mismo
// deal).
export function emparejar(solicitudes: VisitaTablero[], deals: DealCampo[], ownerDe: Map<string, string>): Map<string, DealCampo> {
  const dealsPorOwner = agrupar(deals, (d) => d.ownerId);
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

function agrupar<T>(l: T[], llave: (x: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const x of l) {
    const k = llave(x);
    const g = m.get(k);
    if (g) g.push(x); else m.set(k, [x]);
  }
  return m;
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

// Meta de negocios nuevos del periodo: los que cada vendedor debe encontrar
// por día (su config actual) por cada día que tuvo ruta planeada.
function metaPropiosDe(planeados: PlaneadoMetrica[], propiosPorDia: Map<string, number>): number {
  const dias = new Map<string, Set<string>>();
  for (const p of planeados) {
    if (!propiosPorDia.get(p.vendedorId)) continue;
    const s = dias.get(p.vendedorId) ?? new Set<string>();
    s.add(p.fechaPlan);
    dias.set(p.vendedorId, s);
  }
  let total = 0;
  for (const [id, s] of dias) total += s.size * (propiosPorDia.get(id) ?? 0);
  return total;
}

function bloque(visitas: VisitaTablero[], solicitudes: VisitaTablero[], planeados: PlaneadoMetrica[], ctx: Contexto, metaPropios = 0) {
  // Por negocio, el resultado de su última visita del periodo dice si era
  // un negocio real; con que alguna visita haya mostrado interés, cuenta
  // como interesado.
  const ultima = new Map<string, VisitaTablero>();
  const interesados = new Set<string>();
  let validables = 0;
  let validas = 0;
  const sinComprobar = { nuevo: 0, sinGps: 0, sinUbicacion: 0 };
  for (const v of visitas) {
    const u = ultima.get(v.negocio);
    if (!u || v.createdAt > u.createdAt) ultima.set(v.negocio, v);
    if (CON_INTERES.has(v.resultado)) interesados.add(v.negocio);
    if (v.ubicacionValida != null) { validables++; if (v.ubicacionValida) validas++; }
    if (v.sinComprobar === 'nuevo') sinComprobar.nuevo++;
    else if (v.sinComprobar === 'sin_gps') sinComprobar.sinGps++;
    else if (v.sinComprobar === 'sin_ubicacion') sinComprobar.sinUbicacion++;
  }
  const negociosVisitados = ultima.size;
  const rutaVisitados = new Set(visitas.filter((v) => !v.nuevo).map((v) => v.negocio)).size;
  const propios = new Set(visitas.filter((v) => v.propio).map((v) => v.negocio)).size;
  const metaRuta = planeados.length;
  const meta = metaRuta + metaPropios;
  const noValidos = [...ultima.values()].filter((v) => v.resultado === NO_VALIDO).length;
  const negociosReales = negociosVisitados - noValidos;
  const s = solicitudesDe(solicitudes, ctx);
  return {
    visitas: visitas.length,
    negociosVisitados,
    negociosReales,
    noValidos,
    interesados: interesados.size,
    // Meta = lo planeado en la ruta + los negocios nuevos que debían encontrar.
    // Visitas de ruta de más no compensan los nuevos que falten (ni al revés).
    meta,
    metaRuta,
    metaPropios,
    rutaVisitados,
    propios,
    metaVisitados: planeados.filter((p) => p.estado === 'visitado').length,
    avanceMeta: pct1(Math.min(rutaVisitados, metaRuta) + Math.min(propios, metaPropios), meta),
    ...s,
    conversion: s.solicitudes != null ? pct1(s.solicitudes, negociosReales) : null,
    aprobacion: s.aprobadas != null ? pct1(s.aprobadas, s.aprobadas + (s.rechazadas ?? 0)) : null,
    confirmacion: s.confirmadasVisitas != null ? pct1(s.confirmadasVisitas, s.marcadas) : null,
    // Visitas hechas en el negocio (GPS a 50 m o menos), de las que se pueden comprobar.
    // Las que no se pueden comprobar no cuentan ni a favor ni en contra; se
    // dice cuántas son y por qué.
    validables,
    enNegocio: pct1(validas, validables),
    sinComprobar,
  };
}

// ---------- Ruta ----------

tableroRouter.get('/', async (req, res) => {
  const q = req.query as { vista?: string; fecha?: string; desde?: string; hasta?: string; productoIds?: string; vendedorIds?: string };
  const vista: Vista = q.vista === 'dia' || q.vista === 'semana' || q.vista === 'rango' ? q.vista : 'mes';
  const hoy = hoyMx();
  const ahora = Date.now();
  // No se puede ver el futuro: una fecha posterior a hoy se trata como hoy.
  const fecha = esFechaIso(q.fecha) && q.fecha <= hoy ? q.fecha : hoy;
  let desdeQ = fecha;
  let hastaQ = fecha;
  if (vista === 'rango') {
    hastaQ = esFechaIso(q.hasta) && q.hasta <= hoy ? q.hasta : hoy;
    desdeQ = esFechaIso(q.desde) ? q.desde : sumarDias(hastaQ, -29);
    if (desdeQ > hastaQ) [desdeQ, hastaQ] = [hastaQ, desdeQ];
    if (diasEntre(desdeQ, hastaQ) >= MAX_DIAS_RANGO) desdeQ = sumarDias(hastaQ, -(MAX_DIAS_RANGO - 1));
  }
  const { actual, previo, enCurso, tendencia, tendenciaPor } = periodos(vista, desdeQ, hastaQ, ahora);

  const filtro = await resolveVendedorIds(parseCsvParam(q.vendedorIds), parseCsvParam(q.productoIds));
  const vendedoresDocs = await getVendedoresDocs(filtro);
  const vendedores = vendedoresDocs.map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }));
  const ids = vendedores.map((v) => v.id);
  const idsSet = new Set(ids);
  // Sin filtro se lee por fecha (una sola consulta); las solicitudes sí van
  // por vendedor para usar el índice vendedor+resultado+fecha.
  const idsConsulta = filtro ? ids : null;

  const rangoSolicitudes = { start: Math.min(previo.start, tendencia[0]?.start ?? actual.start), end: actual.end };
  // Visitas de los tramos anteriores de la tendencia: en un rango a elegir
  // salen de las mismas visitas del periodo; en día/semana/mes se cuentan.
  const tramosACont = vista === 'rango' ? [] : tendencia.slice(0, -1);
  const vacio = ids.length === 0;
  const [visitasAct, visitasPrev, solicitudesTodas, planAct, planPrev, conteos] = await Promise.all([
    vacio ? [] : visitasEnRango(idsConsulta, actual),
    vacio ? [] : visitasEnRango(idsConsulta, previo),
    vacio ? [] : visitasEnRango(ids, rangoSolicitudes, true),
    vacio ? [] : planeadosEnRango(actual.desde, ultimoDia(actual), idsSet),
    vacio ? [] : planeadosEnRango(previo.desde, ultimoDia(previo), idsSet),
    Promise.all(tramosACont.map((t) => (vacio ? 0 : contarVisitas(idsConsulta, t)))),
  ]);
  const solo = <T extends { vendedorId: string }>(l: T[]) => l.filter((v) => idsSet.has(v.vendedorId));
  const propiosPorDia = new Map(vendedores.map((v) => [v.id, configGuardada(v.rutaConfig)?.propiosPorDia ?? 0]));
  const metaP = (plan: PlaneadoMetrica[]) => metaPropiosDe(plan, propiosPorDia);
  const act = solo(visitasAct);
  const solicitudes = solo(solicitudesTodas);

  // HubSpot: dueño del deal = vendedor con el mismo correo (endpoint de owners).
  const ownerDe = new Map<string, string>();
  let hubspot: {
    estado: 'ok' | 'sin_configurar' | 'error'; mensaje?: string; vendedoresSinCuenta: string[];
  } = { estado: hubspotConfigurado() ? 'ok' : 'sin_configurar', vendedoresSinCuenta: [] };
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
      const deals = await dealsDeCampo(
        [...ownerDe.values()],
        new Date(rangoSolicitudes.start - VENTANA_CONFIRMACION_MS), new Date(rangoSolicitudes.end + VENTANA_CONFIRMACION_MS),
      );
      confirmadas = emparejar(solicitudes, deals, ownerDe);
    } catch (err) {
      console.error('Tablero: HubSpot falló:', err);
      hubspot = { estado: 'error', mensaje: (err as Error).message, vendedoresSinCuenta: [] };
    }
  }
  const ctx: Contexto = { hubspotOk: hubspot.estado === 'ok', confirmadas };
  const enRango = <T extends { createdAt: number }>(l: T[], r: { start: number; end: number }) => l.filter((v) => v.createdAt >= r.start && v.createdAt < r.end);
  const solAct = enRango(solicitudes, actual);

  // Por producto (el producto actual de cada vendedor).
  const productoDe = new Map(vendedores.map((v) => [v.id, v.productoId]));
  const nombresProducto = await productosPorId(vendedores.map((v) => v.productoId));
  const productosConDatos = [...new Set([...act, ...planAct].map((x) => productoDe.get(x.vendedorId) ?? ''))].filter(Boolean);
  const porProducto = productosConDatos.map((pid) => {
    const de = <T extends { vendedorId: string }>(l: T[]) => l.filter((x) => productoDe.get(x.vendedorId) === pid);
    return { productoId: pid, producto: nombresProducto.get(pid) ?? '—', ...bloque(de(act), de(solAct), de(planAct), ctx, metaP(de(planAct))) };
  }).sort((a, b) => (b.solicitudes ?? 0) - (a.solicitudes ?? 0) || b.negociosVisitados - a.negociosVisitados);

  // Por vendedor: el equipo activo, más quien ya no está activo pero
  // trabajó en el periodo (su historia sigue contando).
  const visitasPorVendedor = agrupar(act, (v) => v.vendedorId);
  const solPorVendedor = agrupar(solAct, (v) => v.vendedorId);
  const planPorVendedor = agrupar(planAct, (p) => p.vendedorId);
  const porVendedor = vendedores
    .filter((v) => v.estado !== 'Baja' || visitasPorVendedor.has(v.id))
    .map((v) => {
      const propias = visitasPorVendedor.get(v.id) ?? [];
      return {
        id: v.id, nombre: v.nombre, iniciales: v.iniciales, color: v.color,
        producto: nombresProducto.get(v.productoId) ?? '—', activo: v.estado !== 'Baja',
        sinUsuarioHubspot: ctx.hubspotOk && !ownerDe.has(v.id),
        ultimaVisita: propias.length ? new Date(Math.max(...propias.map((x) => x.createdAt))).toISOString() : null,
        ...bloque(propias, solPorVendedor.get(v.id) ?? [], planPorVendedor.get(v.id) ?? [], ctx, metaP(planPorVendedor.get(v.id) ?? [])),
      };
    })
    .sort((a, b) => (b.solicitudes ?? b.marcadas) - (a.solicitudes ?? a.marcadas) || b.negociosVisitados - a.negociosVisitados || a.nombre.localeCompare(b.nombre));

  const describir = (r: Rango) => ({ desde: r.desde, hasta: r.hasta, inicio: new Date(r.start).toISOString(), fin: new Date(r.end).toISOString() });

  res.json({
    vista, hoy, enCurso, tendenciaPor,
    periodo: describir(actual),
    anterior: describir(previo),
    actual: bloque(act, solAct, planAct, ctx, metaP(planAct)),
    previo: bloque(solo(visitasPrev), enRango(solicitudes, previo), planPrev, ctx, metaP(planPrev)),
    hubspot,
    porProducto,
    porVendedor,
    equipo: { activos: vendedores.filter((v) => v.estado !== 'Baja').length, conVisitas: porVendedor.filter((v) => v.activo && v.visitas > 0).length },
    tendencia: tendencia.map((r, i) => {
      const s = solicitudesDe(enRango(solicitudes, r), ctx);
      const visitas = vista === 'rango' || i === tendencia.length - 1 ? enRango(act, r).length : conteos[i];
      return { desde: r.desde, hasta: r.hasta, parcial: r.parcial, visitas, marcadas: s.marcadas, solicitudes: s.solicitudes, aprobadas: s.aprobadas, rechazadas: s.rechazadas };
    }),
  });
});

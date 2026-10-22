import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { chunkArray, parseCsvParam } from '../firestore-helpers.js';
import { diasEntre, esFechaIso, fechaMx, hoyMx, rangoMx, sumarDias } from '../fechas.js';
import { countChunked, getVendedoresDocs, resolveVendedorIds } from './_filters.js';
import { productosPorId, type VendedorDoc } from './vendedores.js';

// Resumen estratégico del admin: una sola llamada con todo lo que muestra la
// página "Resumen" para el periodo y el filtro elegidos.
export const metricasRouter = Router();

const RESULTADOS = ['Se realizó solicitud', 'Se dejó información', 'Se reagenda visita', 'Cliente no interesado', 'No es un negocio válido o existente'];
// Hasta un año por consulta: más que eso ya son miles de lecturas por carga.
const MAX_DIAS = 366;
// Hasta este largo la serie va por día; más largo, por semana.
const MAX_DIAS_SERIE_DIARIA = 45;

interface VisitaMetrica {
  vendedorId: string;
  resultado: string;
  createdAt: Timestamp;
  ubicacionValida?: boolean | null;
  esNegocioNuevo?: boolean;
}

interface PlaneadoMetrica {
  vendedorId: string;
  estado: string;
  fechaPlan: string;
}

const CAMPOS_VISITA = ['vendedorId', 'resultado', 'createdAt', 'ubicacionValida', 'esNegocioNuevo'];

async function visitasEnRango(ids: string[], start: Date, end: Date): Promise<VisitaMetrica[]> {
  const conRango = (q: FirebaseFirestore.Query) => q
    .where('createdAt', '>=', Timestamp.fromDate(start)).where('createdAt', '<', Timestamp.fromDate(end))
    .select(...CAMPOS_VISITA);
  const snaps = await Promise.all(chunkArray(ids).map((c) => conRango(db.collection('visitas').where('vendedorId', 'in', c)).get()));
  return snaps.flatMap((s) => s.docs.map((d) => d.data() as VisitaMetrica));
}

// Negocios que la ruta planeó para el periodo. Se lee por fecha (un solo
// rango) y se filtra el vendedor en memoria.
async function planeadosEnRango(desde: string, hasta: string, ids: Set<string>): Promise<PlaneadoMetrica[]> {
  if (desde > hasta) return [];
  const snap = await db.collection('prospectos')
    .where('fechaPlan', '>=', desde).where('fechaPlan', '<=', hasta)
    .select('vendedorId', 'estado', 'fechaPlan').get();
  return snap.docs.map((d) => d.data() as PlaneadoMetrica).filter((p) => ids.has(p.vendedorId));
}

const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : null);

// Lunes de la semana de `iso` (para agrupar la serie de periodos largos).
function lunesDe(iso: string): string {
  const dia = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return sumarDias(iso, dia === 0 ? -6 : 1 - dia);
}

metricasRouter.get('/resumen', async (req, res) => {
  const q = req.query as { productoIds?: string; vendedorIds?: string; desde?: string; hasta?: string; todo?: string };
  const hoy = hoyMx();
  let hasta = esFechaIso(q.hasta) ? q.hasta : hoy;
  let desde = esFechaIso(q.desde) ? q.desde : sumarDias(hasta, -6);
  // "Todo": desde la primera visita registrada (hasta un año atrás).
  if (q.todo === '1') {
    hasta = hoy;
    const primera = await db.collection('visitas').orderBy('createdAt', 'asc').limit(1).select('createdAt').get();
    const ts = primera.docs[0]?.get('createdAt') as Timestamp | undefined;
    desde = ts ? fechaMx(ts.toDate()) : sumarDias(hoy, -6);
  }
  if (desde > hasta) [desde, hasta] = [hasta, desde];
  if (diasEntre(desde, hasta) >= MAX_DIAS) desde = sumarDias(hasta, -(MAX_DIAS - 1));
  const largo = diasEntre(desde, hasta) + 1;

  // El equipo es el activo en la base de colaboradores (ver equipo.ts): quien
  // ya no está activo no aparece aquí, ni en totales ni en la tabla.
  const filtro = await resolveVendedorIds(parseCsvParam(q.vendedorIds), parseCsvParam(q.productoIds));
  const vendedoresDocs = (await getVendedoresDocs(filtro)).filter((d) => d.get('estado') !== 'Baja');
  const ids = vendedoresDocs.map((d) => d.id);
  const { start, end } = rangoMx(desde, hasta);
  const prev = rangoMx(sumarDias(desde, -largo), sumarDias(desde, -1));

  // El cumplimiento solo cuenta días ya cerrados: lo de hoy todavía se está
  // trabajando (salvo que el periodo sea solo hoy).
  const limitePlan = hasta < hoy ? hasta : desde === hoy ? hoy : sumarDias(hoy, -1);

  const [visitas, visitasPrev, planeados] = ids.length === 0
    ? [[], 0, []] as [VisitaMetrica[], number, PlaneadoMetrica[]]
    : await Promise.all([
      visitasEnRango(ids, start, end),
      countChunked('visitas', 'vendedorId', ids, (qq) => qq
        .where('createdAt', '>=', Timestamp.fromDate(prev.start)).where('createdAt', '<', Timestamp.fromDate(prev.end))),
      planeadosEnRango(desde, limitePlan, new Set(ids)),
    ]);

  const vendedores = vendedoresDocs.map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }));
  const productos = await productosPorId(vendedores.map((v) => v.productoId));

  // Serie (por día o por semana).
  const porSemana = largo > MAX_DIAS_SERIE_DIARIA;
  const serieMap = new Map<string, number>();
  for (let f = porSemana ? lunesDe(desde) : desde; f <= hasta; f = sumarDias(f, porSemana ? 7 : 1)) serieMap.set(f, 0);

  const porVendedor = new Map<string, {
    visitas: number; dias: Set<string>; validables: number; validas: number; nuevos: number; ultima: number;
  }>();
  const resultados = new Map<string, number>();
  let validables = 0;
  let validas = 0;
  let nuevos = 0;
  for (const v of visitas) {
    const fecha = fechaMx(v.createdAt.toDate());
    const clave = porSemana ? lunesDe(fecha) : fecha;
    serieMap.set(clave, (serieMap.get(clave) ?? 0) + 1);
    resultados.set(v.resultado, (resultados.get(v.resultado) ?? 0) + 1);
    const pv = porVendedor.get(v.vendedorId) ?? { visitas: 0, dias: new Set(), validables: 0, validas: 0, nuevos: 0, ultima: 0 };
    pv.visitas++;
    pv.dias.add(fecha);
    pv.ultima = Math.max(pv.ultima, v.createdAt.toMillis());
    if (v.ubicacionValida != null) { pv.validables++; validables++; }
    if (v.ubicacionValida) { pv.validas++; validas++; }
    if (v.esNegocioNuevo) { pv.nuevos++; nuevos++; }
    porVendedor.set(v.vendedorId, pv);
  }

  const planPorVendedor = new Map<string, { planeados: number; cumplidos: number }>();
  for (const p of planeados) {
    const x = planPorVendedor.get(p.vendedorId) ?? { planeados: 0, cumplidos: 0 };
    x.planeados++;
    if (p.estado === 'visitado') x.cumplidos++;
    planPorVendedor.set(p.vendedorId, x);
  }
  const totalPlaneados = planeados.length;
  const totalCumplidos = planeados.filter((p) => p.estado === 'visitado').length;

  const filas = vendedores
    .map((v) => {
      const pv = porVendedor.get(v.id);
      const plan = planPorVendedor.get(v.id) ?? { planeados: 0, cumplidos: 0 };
      const diasActivos = pv?.dias.size ?? 0;
      return {
        id: v.id, nombre: v.nombre, iniciales: v.iniciales, color: v.color,
        producto: productos.get(v.productoId) ?? '—', estado: 'Activo',
        visitas: pv?.visitas ?? 0,
        diasActivos,
        promedioDia: diasActivos ? Math.round(((pv?.visitas ?? 0) / diasActivos) * 10) / 10 : 0,
        planeados: plan.planeados,
        cumplidos: plan.cumplidos,
        cumplimiento: pct(plan.cumplidos, plan.planeados),
        ubicacionValida: pct(pv?.validas ?? 0, pv?.validables ?? 0),
        negociosNuevos: pv?.nuevos ?? 0,
        ultimaVisita: pv?.ultima ? new Date(pv.ultima).toISOString() : null,
      };
    })
    .sort((a, b) => b.visitas - a.visitas || a.nombre.localeCompare(b.nombre));

  const diasVendedor = filas.reduce((s, f) => s + f.diasActivos, 0);
  const activos = vendedores.length;

  res.json({
    desde, hasta, porSemana, limitePlan,
    totales: {
      visitas: visitas.length,
      visitasPrev,
      cambioPct: visitasPrev > 0 ? Math.round(((visitas.length - visitasPrev) / visitasPrev) * 100) : null,
      planeados: totalPlaneados,
      cumplidos: totalCumplidos,
      cumplimiento: pct(totalCumplidos, totalPlaneados),
      promedioDia: diasVendedor ? Math.round((visitas.length / diasVendedor) * 10) / 10 : 0,
      ubicacionValida: pct(validas, validables),
      validables,
      validas,
      negociosNuevos: nuevos,
      vendedoresActivos: activos,
      vendedoresConVisitas: filas.filter((f) => f.visitas > 0).length,
    },
    serie: [...serieMap.entries()].map(([fecha, visitas]) => ({ fecha, visitas })),
    resultados: RESULTADOS.map((r) => ({ resultado: r, count: resultados.get(r) ?? 0 })),
    vendedores: filas,
  });
});

import { Router } from 'express';
import { db, Timestamp, FieldPath } from '../db.js';
import { resolveVendedorIds } from './_filters.js';
import { isEmptyRestriction, parseDateRangeQuery, parseCsvParam } from '../firestore-helpers.js';

export const dashboardRouter = Router();

const RESULTADOS = ['Se realizó solicitud', 'Se dejó información', 'Cliente no interesado', 'No es un negocio válido o existente', 'Se reagenda visita'];
const RESULTADO_COLOR: Record<string, string> = {
  'Se realizó solicitud': '#22a36c',
  'Se dejó información': '#ef8b3e',
  'Cliente no interesado': '#d64545',
  'No es un negocio válido o existente': '#b8c2ba',
  'Se reagenda visita': '#2a6fdb',
};

interface VendedorDoc {
  nombre: string;
  iniciales: string;
  color: string;
  estado: string;
  ciudad: string;
  productoId: string;
}

interface JornadaDoc {
  activa: boolean;
}

async function countVisitas(ids: string[] | null, extra: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query): Promise<number> {
  if (isEmptyRestriction(ids)) return 0;
  let query: FirebaseFirestore.Query = db.collection('visitas');
  if (ids) query = query.where('vendedorId', 'in', ids);
  query = extra(query);
  return (await query.count().get()).data().count;
}

async function countProspectos(ids: string[] | null, extra: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query): Promise<number> {
  if (isEmptyRestriction(ids)) return 0;
  let query: FirebaseFirestore.Query = db.collection('prospectos');
  if (ids) query = query.where('vendedorId', 'in', ids);
  query = extra(query);
  return (await query.count().get()).data().count;
}

async function countVendedores(ids: string[] | null, extra: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query): Promise<number> {
  if (isEmptyRestriction(ids)) return 0;
  let query: FirebaseFirestore.Query = db.collection('vendedores');
  if (ids) query = query.where(FieldPath.documentId(), 'in', ids);
  query = extra(query);
  return (await query.count().get()).data().count;
}

dashboardRouter.get('/summary', async (req, res) => {
  const { productoIds, vendedorIds, desde, hasta } = req.query as { productoIds?: string; vendedorIds?: string; desde?: string; hasta?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  const rango = parseDateRangeQuery(desde, hasta);

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const yStart = new Date(start); yStart.setDate(yStart.getDate() - 1);

  // Sin filtro de fecha ("Todo"): mismo comportamiento de siempre, hoy vs
  // ayer. Con filtro activo, el KPI refleja el rango elegido — "vs ayer" ya
  // no aplica (comparar "esta semana" contra "ayer" no tiene sentido), así
  // que se omite.
  const periodo = rango ?? { start, end };

  const [visitas, visitasAyer, porVisitar, totalVisitas, solicitudes, vendedoresTotal, vendedoresActivos] = await Promise.all([
    countVisitas(ids, (q) => q.where('createdAt', '>=', Timestamp.fromDate(periodo.start)).where('createdAt', '<', Timestamp.fromDate(periodo.end))),
    rango ? Promise.resolve(0) : countVisitas(ids, (q) => q.where('createdAt', '>=', Timestamp.fromDate(yStart)).where('createdAt', '<', Timestamp.fromDate(start))),
    countProspectos(ids, (q) => q.where('estado', '==', 'por_visitar')),
    rango
      ? countVisitas(ids, (q) => q.where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end)))
      : countVisitas(ids, (q) => q),
    rango
      ? countVisitas(ids, (q) => q.where('resultado', '==', 'Se realizó solicitud').where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end)))
      : countVisitas(ids, (q) => q.where('resultado', '==', 'Se realizó solicitud')),
    countVendedores(ids, (q) => q),
    countVendedores(ids, (q) => q.where('estado', '==', 'Activo')),
  ]);

  const conversion = totalVisitas > 0 ? Math.round((solicitudes / totalVisitas) * 100) : 0;
  const vsAyerPct = !rango && visitasAyer > 0 ? Math.round(((visitas - visitasAyer) / visitasAyer) * 100) : null;

  res.json({
    visitasHoy: visitas, visitasAyerPct: vsAyerPct, porVisitar, conversion, vendedoresTotal, vendedoresActivos,
  });
});

dashboardRouter.get('/semana', async (req, res) => {
  const { productoIds, vendedorIds } = req.query as { productoIds?: string; vendedorIds?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));

  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const out: { day: string; val: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const val = await countVisitas(ids, (q) => q.where('createdAt', '>=', Timestamp.fromDate(start)).where('createdAt', '<', Timestamp.fromDate(end)));
    out.push({ day: days[start.getDay()], val });
  }
  res.json(out);
});

dashboardRouter.get('/resultados', async (req, res) => {
  const { productoIds, vendedorIds, desde, hasta } = req.query as { productoIds?: string; vendedorIds?: string; desde?: string; hasta?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  const rango = parseDateRangeQuery(desde, hasta);

  const counts = await Promise.all(RESULTADOS.map((r) => countVisitas(ids, (q) => {
    let query = q.where('resultado', '==', r);
    if (rango) query = query.where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end));
    return query;
  })));
  const total = counts.reduce((a, b) => a + b, 0);
  res.json({
    total,
    items: RESULTADOS.map((r, i) => ({ resultado: r, count: counts[i], pct: total > 0 ? Math.round((counts[i] / total) * 100) : 0, color: RESULTADO_COLOR[r] })),
  });
});

dashboardRouter.get('/actividad', async (req, res) => {
  const { productoIds, vendedorIds, desde, hasta } = req.query as { productoIds?: string; vendedorIds?: string; desde?: string; hasta?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json([]);
  const rango = parseDateRangeQuery(desde, hasta);

  const vendedoresSnap = ids
    ? await db.collection('vendedores').where(FieldPath.documentId(), 'in', ids).get()
    : await db.collection('vendedores').get();
  const vendedores = vendedoresSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));

  const productos = new Map<string, string>();
  await Promise.all([...new Set(vendedores.map((v) => v.productoId))].map(async (pid) => {
    const doc = await db.collection('productos').doc(pid).get();
    if (doc.exists) productos.set(pid, (doc.data() as { nombre: string }).nombre);
  }));

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const fecha = start.toISOString().slice(0, 10);
  const periodo = rango ?? { start, end };

  const out = await Promise.all(vendedores.map(async (v) => {
    const [hoySnap, jornadaDoc] = await Promise.all([
      db.collection('visitas').where('vendedorId', '==', v.id)
        .where('createdAt', '>=', Timestamp.fromDate(periodo.start)).where('createdAt', '<', Timestamp.fromDate(periodo.end)).count().get(),
      db.collection('jornadas').doc(`${v.id}_${fecha}`).get(),
    ]);
    const jornada = jornadaDoc.data() as JornadaDoc | undefined;
    return {
      id: v.id, nombre: v.nombre, iniciales: v.iniciales, color: v.color, producto: productos.get(v.productoId), ciudad: v.ciudad,
      hoy: hoySnap.data().count, estado: jornada?.activa ? 'En ruta' : v.estado === 'Pausado' ? 'Pausado' : 'Sin iniciar',
    };
  }));
  res.json(out);
});

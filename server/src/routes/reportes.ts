import { Router } from 'express';
import { AggregateField } from 'firebase-admin/firestore';
import { db, FieldPath, Timestamp } from '../db.js';
import { resolveVendedorIds } from './_filters.js';
import { isEmptyRestriction, toIso, parseDateRangeQuery, parseCsvParam } from '../firestore-helpers.js';

export const reportesRouter = Router();

interface VisitaDoc {
  nombreNegocio: string;
  resultado: string;
  fotos?: string[];
  // Ya no se escribe: solo se lee por compatibilidad con visitas guardadas
  // antes de soportar varias fotos por visita.
  fotoUrl?: string | null;
  ubicacionValida?: boolean | null;
  distanciaValidacionMetros?: number | null;
  createdAt: FirebaseFirestore.Timestamp;
}

async function countVisitas(ids: string[] | null, extra: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query): Promise<number> {
  if (isEmptyRestriction(ids)) return 0;
  let query: FirebaseFirestore.Query = db.collection('visitas');
  if (ids) query = query.where('vendedorId', 'in', ids);
  query = extra(query);
  return (await query.count().get()).data().count;
}

async function kmRecorridos(vendedorId: string | null, ids: string[] | null): Promise<number> {
  let query: FirebaseFirestore.Query = db.collection('prospectos').where('estado', '==', 'visitado');
  if (vendedorId) query = query.where('vendedorId', '==', vendedorId);
  else if (isEmptyRestriction(ids)) return 0;
  else if (ids) query = query.where('vendedorId', 'in', ids);
  const snap = await query.aggregate({ sum: AggregateField.sum('distanciaKm') }).get();
  return Math.round(((snap.data().sum as number | null) || 0) * 10) / 10;
}

function conRango(q: FirebaseFirestore.Query, rango: { start: Date; end: Date } | null): FirebaseFirestore.Query {
  if (!rango) return q;
  return q.where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end));
}

reportesRouter.get('/summary', async (req, res) => {
  const { productoIds, vendedorIds, desde, hasta } = req.query as { productoIds?: string; vendedorIds?: string; desde?: string; hasta?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  const rango = parseDateRangeQuery(desde, hasta);

  const [visitasTotales, solicitudes, km] = await Promise.all([
    countVisitas(ids, (q) => conRango(q, rango)),
    countVisitas(ids, (q) => conRango(q.where('resultado', '==', 'Se realizó solicitud'), rango)),
    kmRecorridos(null, ids),
  ]);
  const conversion = visitasTotales > 0 ? Math.round((solicitudes / visitasTotales) * 100) : 0;

  res.json({ visitasTotales, solicitudes, conversion, kmRecorridos: km });
});

reportesRouter.get('/vendedores', async (req, res) => {
  const { productoIds, vendedorIds, desde, hasta } = req.query as { productoIds?: string; vendedorIds?: string; desde?: string; hasta?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json([]);
  const rango = parseDateRangeQuery(desde, hasta);

  const snap = ids
    ? await db.collection('vendedores').where(FieldPath.documentId(), 'in', ids).get()
    : await db.collection('vendedores').get();
  const vendedores = snap.docs.map((d) => ({ id: d.id, nombre: (d.data() as { nombre: string }).nombre }));

  const out = await Promise.all(vendedores.map(async (v) => {
    const [total, solicitudes, km] = await Promise.all([
      countVisitas([v.id], (q) => conRango(q, rango)),
      countVisitas([v.id], (q) => conRango(q.where('resultado', '==', 'Se realizó solicitud'), rango)),
      kmRecorridos(v.id, null),
    ]);
    const w1 = total > 0 ? Math.round((solicitudes / total) * 100) : 0;
    return { id: v.id, nombre: v.nombre, total, solicitudes, km, w1: `${w1}%`, w2: `${100 - w1}%` };
  }));
  res.json(out.sort((a, b) => b.total - a.total));
});

reportesRouter.get('/evidencias', async (req, res) => {
  const { productoIds, vendedorIds, desde, hasta } = req.query as { productoIds?: string; vendedorIds?: string; desde?: string; hasta?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json([]);
  const rango = parseDateRangeQuery(desde, hasta);

  let query: FirebaseFirestore.Query = db.collection('visitas');
  if (ids) query = query.where('vendedorId', 'in', ids);
  query = conRango(query, rango);
  // fotos != [] no se puede combinar con orderBy(createdAt) en Firestore; se
  // pide de más y se filtra/recorta en memoria.
  const snap = await query.orderBy('createdAt', 'desc').limit(50).get();
  const visitas = snap.docs.map((d) => ({ id: d.id, ...(d.data() as VisitaDoc) }));

  // Una visita puede traer varias fotos: se aplana a una tarjeta de evidencia
  // por foto (con un id propio, ver más abajo) en vez de mostrar solo la
  // primera y perder el resto.
  const MAX_EVIDENCIAS = 12;
  const evidencias: { id: string; nombre: string; resultado: string; fotoUrl: string; ubicacionValida: boolean | null; distanciaValidacionMetros: number | null; createdAt: string | null }[] = [];
  for (const v of visitas) {
    const fotos = v.fotos && v.fotos.length ? v.fotos : v.fotoUrl ? [v.fotoUrl] : [];
    for (const [i, fotoUrl] of fotos.entries()) {
      evidencias.push({
        id: `${v.id}_${i}`, nombre: v.nombreNegocio, resultado: v.resultado, fotoUrl,
        ubicacionValida: v.ubicacionValida ?? null, distanciaValidacionMetros: v.distanciaValidacionMetros ?? null,
        createdAt: toIso(v.createdAt),
      });
      if (evidencias.length >= MAX_EVIDENCIAS) break;
    }
    if (evidencias.length >= MAX_EVIDENCIAS) break;
  }

  res.json(evidencias);
});

import { Router } from 'express';
import { AggregateField } from 'firebase-admin/firestore';
import { db, FieldPath } from '../db.js';
import { resolveVendedorIds } from './_filters.js';
import { isEmptyRestriction, toIso } from '../firestore-helpers.js';

export const reportesRouter = Router();

interface VisitaDoc {
  nombreNegocio: string;
  resultado: string;
  fotoUrl?: string | null;
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

reportesRouter.get('/summary', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);

  const [visitasTotales, solicitudes, km] = await Promise.all([
    countVisitas(ids, (q) => q),
    countVisitas(ids, (q) => q.where('resultado', '==', 'Se realizó solicitud')),
    kmRecorridos(null, ids),
  ]);
  const conversion = visitasTotales > 0 ? Math.round((solicitudes / visitasTotales) * 100) : 0;

  res.json({ visitasTotales, solicitudes, conversion, kmRecorridos: km });
});

reportesRouter.get('/vendedores', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  if (isEmptyRestriction(ids)) return res.json([]);

  const snap = ids
    ? await db.collection('vendedores').where(FieldPath.documentId(), 'in', ids).get()
    : await db.collection('vendedores').get();
  const vendedores = snap.docs.map((d) => ({ id: d.id, nombre: (d.data() as { nombre: string }).nombre }));

  const out = await Promise.all(vendedores.map(async (v) => {
    const [total, solicitudes, km] = await Promise.all([
      countVisitas([v.id], (q) => q),
      countVisitas([v.id], (q) => q.where('resultado', '==', 'Se realizó solicitud')),
      kmRecorridos(v.id, null),
    ]);
    const w1 = total > 0 ? Math.round((solicitudes / total) * 100) : 0;
    return { id: v.id, nombre: v.nombre, total, solicitudes, km, w1: `${w1}%`, w2: `${100 - w1}%` };
  }));
  res.json(out.sort((a, b) => b.total - a.total));
});

reportesRouter.get('/evidencias', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  if (isEmptyRestriction(ids)) return res.json([]);

  let query: FirebaseFirestore.Query = db.collection('visitas');
  if (ids) query = query.where('vendedorId', 'in', ids);
  // fotoUrl != null no se puede combinar con orderBy(createdAt) en Firestore;
  // se pide de más y se filtra/recorta en memoria.
  const snap = await query.orderBy('createdAt', 'desc').limit(50).get();
  const visitas = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as VisitaDoc) }))
    .filter((v) => v.fotoUrl)
    .slice(0, 12);

  res.json(visitas.map((v) => ({ id: v.id, nombre: v.nombreNegocio, resultado: v.resultado, fotoUrl: v.fotoUrl, createdAt: toIso(v.createdAt) })));
});

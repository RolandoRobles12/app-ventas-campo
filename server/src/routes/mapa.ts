import { Router } from 'express';
import { db } from '../db.js';
import { resolveVendedorIds } from './_filters.js';
import { isEmptyRestriction } from '../firestore-helpers.js';

export const mapaRouter = Router();

interface ProspectoDoc {
  vendedorId: string;
  nombre: string;
  direccion: string;
  estado: string;
  lat?: number | null;
  lng?: number | null;
}

async function countProspectos(ids: string[] | null, extra: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query): Promise<number> {
  if (isEmptyRestriction(ids)) return 0;
  let query: FirebaseFirestore.Query = db.collection('prospectos');
  if (ids) query = query.where('vendedorId', 'in', ids);
  query = extra(query);
  return (await query.count().get()).data().count;
}

mapaRouter.get('/leads', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);

  let leads: { id: string; data: ProspectoDoc }[] = [];
  if (!isEmptyRestriction(ids)) {
    let query: FirebaseFirestore.Query = db.collection('prospectos');
    if (ids) query = query.where('vendedorId', 'in', ids);
    // Se pide de más porque filtramos lat/lng en memoria (Firestore no permite
    // combinar dos filtros "!= null" en la misma consulta).
    const snap = await query.orderBy('createdAt', 'desc').limit(600).get();
    leads = snap.docs
      .map((d) => ({ id: d.id, data: d.data() as ProspectoDoc }))
      .filter((l) => l.data.lat != null && l.data.lng != null)
      .slice(0, 300);
  }

  const vendedorIds = [...new Set(leads.map((l) => l.data.vendedorId))];
  const vendedores = new Map<string, string>();
  await Promise.all(vendedorIds.map(async (id) => {
    const doc = await db.collection('vendedores').doc(id).get();
    if (doc.exists) vendedores.set(id, (doc.data() as { nombre: string }).nombre);
  }));

  const [total, porVisitar, visitados] = await Promise.all([
    countProspectos(ids, (q) => q),
    countProspectos(ids, (q) => q.where('estado', '==', 'por_visitar')),
    countProspectos(ids, (q) => q.where('estado', '==', 'visitado')),
  ]);
  const sincronizadosCrm = (await db.collection('crmDeals').where('source', '==', 'hubspot').count().get()).data().count;

  res.json({
    totales: { total, porVisitar, visitados, sincronizadosCrm },
    leads: leads.map(({ id, data: p }) => ({
      id, nombre: p.nombre, direccion: p.direccion, estado: p.estado, lat: p.lat, lng: p.lng,
      vendedor: vendedores.get(p.vendedorId) || '', color: p.estado === 'visitado' ? '#22a36c' : '#ef8b3e',
    })),
  });
});

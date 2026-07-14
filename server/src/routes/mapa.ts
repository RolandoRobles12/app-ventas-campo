import { Router } from 'express';
import { db, Timestamp } from '../db.js';
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

interface VisitaGeoDoc {
  vendedorId: string;
  prospectoId: string | null;
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

// Puntos para el mapa de calor: la ubicación GPS de cada visita registrada.
// Las visitas antiguas (sin GPS propio) heredan las coordenadas de su prospecto.
mapaRouter.get('/calor', async (req, res) => {
  const { producto, vendedor, dias } = req.query as { producto?: string; vendedor?: string; dias?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  if (isEmptyRestriction(ids)) return res.json({ puntos: [], visitasTotales: 0, visitasConUbicacion: 0 });

  let query: FirebaseFirestore.Query = db.collection('visitas');
  if (ids) query = query.where('vendedorId', 'in', ids);
  const nDias = Number(dias);
  if (Number.isFinite(nDias) && nDias > 0) {
    const desde = new Date();
    desde.setDate(desde.getDate() - nDias);
    query = query.where('createdAt', '>=', Timestamp.fromDate(desde));
  }
  const snap = await query.orderBy('createdAt', 'desc').limit(2000).get();
  const visitas = snap.docs.map((d) => d.data() as VisitaGeoDoc);

  // Resuelve coordenadas faltantes vía el prospecto asociado (una lectura por prospecto único).
  const sinGps = [...new Set(visitas.filter((v) => (v.lat == null || v.lng == null) && v.prospectoId).map((v) => v.prospectoId as string))];
  const prospectoCoords = new Map<string, { lat: number; lng: number }>();
  await Promise.all(sinGps.map(async (pid) => {
    const doc = await db.collection('prospectos').doc(pid).get();
    const p = doc.exists ? (doc.data() as ProspectoDoc) : null;
    if (p && p.lat != null && p.lng != null) prospectoCoords.set(pid, { lat: p.lat, lng: p.lng });
  }));

  // Agrega visitas en el mismo punto como peso, para que la intensidad refleje densidad real.
  const agregado = new Map<string, { lat: number; lng: number; peso: number }>();
  let conUbicacion = 0;
  for (const v of visitas) {
    const coords = v.lat != null && v.lng != null
      ? { lat: v.lat, lng: v.lng }
      : (v.prospectoId ? prospectoCoords.get(v.prospectoId) : undefined);
    if (!coords) continue;
    conUbicacion++;
    const key = `${coords.lat.toFixed(5)},${coords.lng.toFixed(5)}`;
    const prev = agregado.get(key);
    if (prev) prev.peso++;
    else agregado.set(key, { lat: coords.lat, lng: coords.lng, peso: 1 });
  }

  res.json({
    puntos: [...agregado.values()],
    visitasTotales: visitas.length,
    visitasConUbicacion: conUbicacion,
  });
});

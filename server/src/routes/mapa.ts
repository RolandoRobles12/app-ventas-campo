import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { resolveVendedorIds, getRecientesPorVendedor } from './_filters.js';
import { isEmptyRestriction, parseDateRangeQuery, parseCsvParam } from '../firestore-helpers.js';

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

// Puntos para el mapa de calor: la ubicación GPS de cada visita registrada.
// Las visitas antiguas (sin GPS propio) heredan las coordenadas de su prospecto.
mapaRouter.get('/calor', async (req, res) => {
  const { productoIds, vendedorIds, desde, hasta } = req.query as { productoIds?: string; vendedorIds?: string; desde?: string; hasta?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json({ puntos: [], visitasTotales: 0, visitasConUbicacion: 0 });
  const rango = parseDateRangeQuery(desde, hasta);

  const visitaDocs = await getRecientesPorVendedor('visitas', ids, 2000, (q) =>
    rango ? q.where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end)) : q);
  const visitas = visitaDocs.map((d) => d.data() as VisitaGeoDoc);

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

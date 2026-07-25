import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';

export const ubicacionesRouter = Router();

interface UbicacionDoc {
  vendedorId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  createdAt: Timestamp;
}

function parseCoord(raw: unknown, min: number, max: number): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Un punto de GPS del recorrido del vendedor (ver LocationTracker en la app
// del vendedor: manda uno cada ~5 min mientras la jornada está activa).
ubicacionesRouter.post('/', async (req, res) => {
  const { vendedorId, lat, lng, accuracy } = req.body as { vendedorId?: string; lat?: unknown; lng?: unknown; accuracy?: unknown };
  const parsedLat = parseCoord(lat, -90, 90);
  const parsedLng = parseCoord(lng, -180, 180);
  if (!vendedorId || parsedLat == null || parsedLng == null) {
    return res.status(400).json({ error: 'vendedorId, lat y lng son requeridos' });
  }

  const data: UbicacionDoc = {
    vendedorId, lat: parsedLat, lng: parsedLng,
    accuracy: parseCoord(accuracy, 0, 100000),
    createdAt: Timestamp.now(),
  };
  await db.collection('ubicaciones').add(data);
  res.status(201).json({ ok: true });
});

// Recorrido de un vendedor en un día (hoy por default): los puntos GPS que
// mandó su app mientras tuvo la jornada activa, en orden cronológico —
// listos para dibujar como polilínea en el admin.
ubicacionesRouter.get('/:vendedorId/recorrido', async (req, res) => {
  const { fecha } = req.query as { fecha?: string };
  const dia = fecha && /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : new Date().toISOString().slice(0, 10);
  const start = new Date(`${dia}T00:00:00`);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const snap = await db.collection('ubicaciones')
    .where('vendedorId', '==', req.params.vendedorId)
    .where('createdAt', '>=', Timestamp.fromDate(start))
    .where('createdAt', '<', Timestamp.fromDate(end))
    .orderBy('createdAt', 'asc')
    .get();

  res.json(snap.docs.map((d) => {
    const v = d.data() as UbicacionDoc;
    return { lat: v.lat, lng: v.lng, accuracy: v.accuracy, createdAt: toIso(v.createdAt) };
  }));
});

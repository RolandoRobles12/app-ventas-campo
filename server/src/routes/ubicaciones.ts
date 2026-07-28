import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso, parseDateRangeQuery, parseCsvParam, parseCapturadoEn } from '../firestore-helpers.js';
import { requireAdmin, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { resolveVendedorIds } from './_filters.js';

export const ubicacionesRouter = Router();

interface UbicacionDoc {
  vendedorId: string;
  lat: number;
  lng: number;
  accuracy: number | null;
  createdAt: Timestamp;
}

interface VendedorLookupDoc {
  nombre: string;
  color: string;
}

// Tope de vendedores cuyas rutas se dibujan a la vez: más que esto y el mapa
// se vuelve ilegible (y son N consultas en paralelo, una por vendedor).
const MAX_VENDEDORES_RECORRIDO = 20;
const MAX_PUNTOS_POR_VENDEDOR = 1000;

// Un fix de red (sin GPS real) puede traer precisión de 1-2 km y mete picos
// absurdos en la polilínea del recorrido; los puntos peores que esto se
// omiten al dibujar. Los que no traen accuracy (registros viejos) se dejan.
const MAX_ACCURACY_RECORRIDO_M = 200;

function parseCoord(raw: unknown, min: number, max: number): number | null {
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

// Un punto de GPS del recorrido del vendedor (ver LocationTracker en la app
// del vendedor: manda uno cada ~5 min mientras la jornada está activa).
// `capturadoEn` viene solo en los puntos que se guardaron sin señal y se
// reenvían después, para que el recorrido conserve la hora real de captura.
ubicacionesRouter.post('/', async (req, res) => {
  const { vendedorId, lat, lng, accuracy, capturadoEn } = req.body as {
    vendedorId?: string; lat?: unknown; lng?: unknown; accuracy?: unknown; capturadoEn?: unknown;
  };
  const parsedLat = parseCoord(lat, -90, 90);
  const parsedLng = parseCoord(lng, -180, 180);
  if (!vendedorId || parsedLat == null || parsedLng == null) {
    return res.status(400).json({ error: 'vendedorId, lat y lng son requeridos' });
  }
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);

  const data: UbicacionDoc = {
    vendedorId, lat: parsedLat, lng: parsedLng,
    accuracy: parseCoord(accuracy, 0, 100000),
    createdAt: parseCapturadoEn(capturadoEn) ?? Timestamp.now(),
  };
  await db.collection('ubicaciones').add(data);
  res.status(201).json({ ok: true });
});

// Recorrido de uno o varios vendedores (por equipo/producto) en un rango de
// fechas — hoy por default —, listo para dibujar como una polilínea por
// vendedor en el admin (Visitas y Seguimiento). A diferencia de otros
// endpoints filtrados, aquí SÍ hace falta elegir vendedor(es) o producto(s)
// explícitamente: "todos" dibujaría decenas de rutas encimadas e ilegibles,
// además de disparar una consulta por cada vendedor de la empresa.
ubicacionesRouter.get('/recorrido', requireAdmin, async (req, res) => {
  const { vendedorIds, productoIds, desde, hasta } = req.query as {
    vendedorIds?: string; productoIds?: string; desde?: string; hasta?: string;
  };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (!ids || ids.length === 0) {
    return res.status(400).json({ error: 'FALTA_VENDEDOR', message: 'Elige uno o varios vendedores (o un producto) para ver sus rutas.' });
  }
  if (ids.length > MAX_VENDEDORES_RECORRIDO) {
    return res.status(400).json({ error: 'DEMASIADOS_VENDEDORES', message: `Elige como máximo ${MAX_VENDEDORES_RECORRIDO} vendedores a la vez para ver sus rutas.` });
  }

  const dia = new Date().toISOString().slice(0, 10);
  const rango = parseDateRangeQuery(desde, hasta) ?? (() => {
    const start = new Date(`${dia}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  })();

  const [vendedoresSnaps, puntosSnaps] = await Promise.all([
    Promise.all(ids.map((id) => db.collection('vendedores').doc(id).get())),
    Promise.all(ids.map((id) => db.collection('ubicaciones')
      .where('vendedorId', '==', id)
      .where('createdAt', '>=', Timestamp.fromDate(rango.start))
      .where('createdAt', '<', Timestamp.fromDate(rango.end))
      .orderBy('createdAt', 'asc')
      .limit(MAX_PUNTOS_POR_VENDEDOR)
      .get())),
  ]);

  const out = ids.map((id, i) => {
    const vDoc = vendedoresSnaps[i];
    const v = vDoc.exists ? (vDoc.data() as VendedorLookupDoc) : null;
    return {
      vendedorId: id,
      nombre: v?.nombre ?? '—',
      color: v?.color ?? '#2a6fdb',
      puntos: puntosSnaps[i].docs
        .map((d) => d.data() as UbicacionDoc)
        .filter((u) => u.accuracy == null || u.accuracy <= MAX_ACCURACY_RECORRIDO_M)
        .map((u) => ({ lat: u.lat, lng: u.lng, createdAt: toIso(u.createdAt) })),
    };
  });

  res.json(out);
});

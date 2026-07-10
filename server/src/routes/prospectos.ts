import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';

export const prospectosRouter = Router();

interface ProspectoDoc {
  vendedorId: string;
  nombre: string;
  direccion: string;
  giro?: string | null;
  distanciaKm?: number | null;
  telefono?: string | null;
  origen: string;
  estado: string;
  lat?: number | null;
  lng?: number | null;
  createdAt: Timestamp;
}

function shape(id: string, p: ProspectoDoc) {
  return {
    id,
    vendedorId: p.vendedorId,
    nombre: p.nombre,
    direccion: p.direccion,
    giro: p.giro ?? null,
    distanciaKm: p.distanciaKm ?? null,
    telefono: p.telefono ?? null,
    origen: p.origen,
    estado: p.estado,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    createdAt: toIso(p.createdAt),
  };
}

function porEstadoYDistancia(a: { estado: string; distanciaKm: number | null }, b: { estado: string; distanciaKm: number | null }) {
  if (a.estado !== b.estado) return a.estado.localeCompare(b.estado);
  return (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity);
}

// Lista de prospectos de un vendedor (usada por la app del vendedor y por el admin)
prospectosRouter.get('/vendedor/:vendedorId', async (req, res) => {
  const snap = await db.collection('prospectos').where('vendedorId', '==', req.params.vendedorId).get();
  const prospectos = snap.docs
    .map((d) => shape(d.id, d.data() as ProspectoDoc))
    .sort(porEstadoYDistancia);
  res.json(prospectos);
});

// Alta manual de un negocio (fuera de lista, o agregado a mano en el wizard de admin)
prospectosRouter.post('/', async (req, res) => {
  const { vendedorId, nombre, direccion, giro, telefono, distanciaKm, lat, lng, origen } = req.body as {
    vendedorId: string; nombre: string; direccion: string; giro?: string; telefono?: string;
    distanciaKm?: number; lat?: number; lng?: number; origen?: string;
  };
  if (!vendedorId || !nombre) return res.status(400).json({ error: 'vendedorId y nombre son requeridos' });

  const data: ProspectoDoc = {
    vendedorId, nombre, direccion: direccion || '', giro: giro ?? null, telefono: telefono ?? null,
    distanciaKm: distanciaKm ?? null, lat: lat ?? null, lng: lng ?? null,
    origen: origen || 'manual', estado: 'por_visitar', createdAt: Timestamp.now(),
  };
  const ref = await db.collection('prospectos').add(data);
  res.status(201).json(shape(ref.id, data));
});

// Alta masiva (resultado del wizard: consulta DENUE + manuales agregados en esa sesión)
prospectosRouter.post('/bulk', async (req, res) => {
  const { vendedorId, items } = req.body as {
    vendedorId: string;
    items: { nombre: string; direccion: string; giro?: string; telefono?: string; distanciaKm?: number; lat?: number; lng?: number; origen?: string }[];
  };
  if (!vendedorId || !Array.isArray(items)) return res.status(400).json({ error: 'vendedorId e items son requeridos' });

  const existingSnap = await db.collection('prospectos').where('vendedorId', '==', vendedorId).get();
  const existingKeys = new Set(existingSnap.docs.map((d) => {
    const p = d.data() as ProspectoDoc;
    return `${p.nombre}::${p.direccion}`;
  }));
  const nuevos = items.filter((i) => !existingKeys.has(`${i.nombre}::${i.direccion}`));

  if (nuevos.length) {
    const batch = db.batch();
    for (const i of nuevos) {
      const ref = db.collection('prospectos').doc();
      const data: ProspectoDoc = {
        vendedorId, nombre: i.nombre, direccion: i.direccion || '', giro: i.giro ?? null, telefono: i.telefono ?? null,
        distanciaKm: i.distanciaKm ?? null, lat: i.lat ?? null, lng: i.lng ?? null,
        origen: i.origen || 'denue', estado: 'por_visitar', createdAt: Timestamp.now(),
      };
      batch.set(ref, data);
    }
    await batch.commit();
  }

  const snap = await db.collection('prospectos').where('vendedorId', '==', vendedorId).get();
  const prospectos = snap.docs.map((d) => shape(d.id, d.data() as ProspectoDoc)).sort(porEstadoYDistancia);
  res.status(201).json({ creados: nuevos.length, prospectos });
});

prospectosRouter.delete('/:id', async (req, res) => {
  await db.collection('prospectos').doc(req.params.id).delete().catch(() => null);
  res.status(204).end();
});

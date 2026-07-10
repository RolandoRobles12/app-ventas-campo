import { Router } from 'express';
import { prisma } from '../db.js';

export const prospectosRouter = Router();

function shape(p: any) {
  return {
    id: p.id,
    vendedorId: p.vendedorId,
    nombre: p.nombre,
    direccion: p.direccion,
    giro: p.giro,
    distanciaKm: p.distanciaKm,
    telefono: p.telefono,
    origen: p.origen,
    estado: p.estado,
    lat: p.lat,
    lng: p.lng,
    createdAt: p.createdAt,
  };
}

// Lista de prospectos de un vendedor (usada por la app del vendedor y por el admin)
prospectosRouter.get('/vendedor/:vendedorId', async (req, res) => {
  const prospectos = await prisma.prospecto.findMany({
    where: { vendedorId: req.params.vendedorId },
    orderBy: [{ estado: 'asc' }, { distanciaKm: 'asc' }],
  });
  res.json(prospectos.map(shape));
});

// Alta manual de un negocio (fuera de lista, o agregado a mano en el wizard de admin)
prospectosRouter.post('/', async (req, res) => {
  const { vendedorId, nombre, direccion, giro, telefono, distanciaKm, lat, lng, origen } = req.body as {
    vendedorId: string; nombre: string; direccion: string; giro?: string; telefono?: string;
    distanciaKm?: number; lat?: number; lng?: number; origen?: string;
  };
  if (!vendedorId || !nombre) return res.status(400).json({ error: 'vendedorId y nombre son requeridos' });

  const p = await prisma.prospecto.create({
    data: {
      vendedorId, nombre, direccion: direccion || '', giro, telefono,
      distanciaKm, lat, lng, origen: origen || 'manual', estado: 'por_visitar',
    },
  });
  res.status(201).json(shape(p));
});

// Alta masiva (resultado del wizard: consulta DENUE + manuales agregados en esa sesión)
prospectosRouter.post('/bulk', async (req, res) => {
  const { vendedorId, items } = req.body as {
    vendedorId: string;
    items: { nombre: string; direccion: string; giro?: string; telefono?: string; distanciaKm?: number; lat?: number; lng?: number; origen?: string }[];
  };
  if (!vendedorId || !Array.isArray(items)) return res.status(400).json({ error: 'vendedorId e items son requeridos' });

  const existing = await prisma.prospecto.findMany({ where: { vendedorId }, select: { nombre: true, direccion: true } });
  const existingKeys = new Set(existing.map((e) => `${e.nombre}::${e.direccion}`));
  const nuevos = items.filter((i) => !existingKeys.has(`${i.nombre}::${i.direccion}`));

  if (nuevos.length) {
    await prisma.prospecto.createMany({
      data: nuevos.map((i) => ({
        vendedorId, nombre: i.nombre, direccion: i.direccion || '', giro: i.giro, telefono: i.telefono,
        distanciaKm: i.distanciaKm, lat: i.lat, lng: i.lng, origen: i.origen || 'denue', estado: 'por_visitar',
      })),
    });
  }

  const prospectos = await prisma.prospecto.findMany({ where: { vendedorId }, orderBy: [{ estado: 'asc' }, { distanciaKm: 'asc' }] });
  res.status(201).json({ creados: nuevos.length, prospectos: prospectos.map(shape) });
});

prospectosRouter.delete('/:id', async (req, res) => {
  await prisma.prospecto.delete({ where: { id: req.params.id } }).catch(() => null);
  res.status(204).end();
});

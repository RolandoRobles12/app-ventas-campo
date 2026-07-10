import { Router } from 'express';
import { prisma } from '../db.js';

export const vendedoresRouter = Router();

function shape(v: any) {
  return {
    id: v.id,
    nombre: v.nombre,
    iniciales: v.iniciales,
    color: v.color,
    email: v.email,
    estado: v.estado,
    ciudad: v.ciudad,
    colonia: v.colonia,
    drawZone: v.drawZone,
    producto: v.producto?.nombre,
    productoId: v.productoId,
    giros: (v.giros || []).map((g: any) => g.giro.nombre),
    prospectosCount: v._count?.prospectos ?? undefined,
  };
}

vendedoresRouter.get('/', async (req, res) => {
  const { producto } = req.query as { producto?: string };
  const vendedores = await prisma.vendedor.findMany({
    where: producto && producto !== 'Todos los productos' ? { producto: { nombre: producto } } : undefined,
    include: { producto: true, giros: { include: { giro: true } }, _count: { select: { prospectos: true } } },
    orderBy: { nombre: 'asc' },
  });
  res.json(vendedores.map(shape));
});

vendedoresRouter.get('/:id', async (req, res) => {
  const v = await prisma.vendedor.findUnique({
    where: { id: req.params.id },
    include: { producto: true, giros: { include: { giro: true } }, _count: { select: { prospectos: true } } },
  });
  if (!v) return res.status(404).json({ error: 'not_found' });
  res.json(shape(v));
});

// Configura (o reconfigura) la ruta de un vendedor: producto, zona y giros.
vendedoresRouter.put('/:id/ruta', async (req, res) => {
  const { productoId, ciudad, colonia, giros, drawZone } = req.body as {
    productoId?: string; ciudad?: string; colonia?: string; giros?: string[]; drawZone?: boolean;
  };

  const data: any = {};
  if (productoId) data.productoId = productoId;
  if (ciudad !== undefined) data.ciudad = ciudad;
  if (colonia !== undefined) data.colonia = colonia;
  if (drawZone !== undefined) data.drawZone = drawZone;

  await prisma.vendedor.update({ where: { id: req.params.id }, data });

  if (giros) {
    await prisma.vendedorGiro.deleteMany({ where: { vendedorId: req.params.id } });
    const giroRecords = await prisma.giro.findMany({ where: { nombre: { in: giros } } });
    await prisma.vendedorGiro.createMany({
      data: giroRecords.map((g) => ({ vendedorId: req.params.id, giroId: g.id })),
    });
  }

  const v = await prisma.vendedor.findUnique({
    where: { id: req.params.id },
    include: { producto: true, giros: { include: { giro: true } }, _count: { select: { prospectos: true } } },
  });
  res.json(shape(v));
});

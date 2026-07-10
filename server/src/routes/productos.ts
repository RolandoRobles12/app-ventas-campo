import { Router } from 'express';
import { prisma } from '../db.js';

export const productosRouter = Router();

productosRouter.get('/', async (_req, res) => {
  const productos = await prisma.producto.findMany({
    include: { giros: { include: { giro: true } } },
    orderBy: { nombre: 'asc' },
  });
  res.json(
    productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      esDeCampo: p.esDeCampo,
      giros: p.giros.map((g) => g.giro.nombre),
    })),
  );
});

productosRouter.get('/de-campo', async (_req, res) => {
  const productos = await prisma.producto.findMany({
    where: { esDeCampo: true },
    include: { giros: { include: { giro: true } } },
    orderBy: { nombre: 'asc' },
  });
  res.json(
    productos.map((p) => ({
      id: p.id,
      nombre: p.nombre,
      giros: p.giros.map((g) => g.giro.nombre),
    })),
  );
});

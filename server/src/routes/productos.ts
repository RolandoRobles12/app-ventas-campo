import { Router } from 'express';
import { db } from '../db.js';

export const productosRouter = Router();

interface ProductoDoc {
  nombre: string;
  esDeCampo: boolean;
  giros: string[];
}

productosRouter.get('/', async (_req, res) => {
  const snap = await db.collection('productos').orderBy('nombre', 'asc').get();
  res.json(
    snap.docs.map((d) => {
      const p = d.data() as ProductoDoc;
      return { id: d.id, nombre: p.nombre, esDeCampo: p.esDeCampo, giros: p.giros || [] };
    }),
  );
});

productosRouter.get('/de-campo', async (_req, res) => {
  const snap = await db.collection('productos').orderBy('nombre', 'asc').get();
  res.json(
    snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as ProductoDoc) }))
      .filter((p) => p.esDeCampo)
      .map((p) => ({ id: p.id, nombre: p.nombre, giros: p.giros || [] })),
  );
});

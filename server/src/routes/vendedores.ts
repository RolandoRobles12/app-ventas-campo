import { Router } from 'express';
import { db } from '../db.js';

export const vendedoresRouter = Router();

interface VendedorDoc {
  nombre: string;
  iniciales: string;
  color: string;
  email: string | null;
  estado: string;
  ciudad: string;
  colonia: string | null;
  drawZone: boolean;
  productoId: string;
  giros: string[];
}

async function productosPorId(ids: string[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids)].filter(Boolean);
  const map = new Map<string, string>();
  await Promise.all(
    unique.map(async (id) => {
      const doc = await db.collection('productos').doc(id).get();
      if (doc.exists) map.set(id, (doc.data() as { nombre: string }).nombre);
    }),
  );
  return map;
}

async function shape(id: string, v: VendedorDoc, productoNombre?: string) {
  const prospectosCount = (await db.collection('prospectos').where('vendedorId', '==', id).count().get()).data().count;
  return {
    id,
    nombre: v.nombre,
    iniciales: v.iniciales,
    color: v.color,
    email: v.email,
    estado: v.estado,
    ciudad: v.ciudad,
    colonia: v.colonia,
    drawZone: v.drawZone,
    producto: productoNombre,
    productoId: v.productoId,
    giros: v.giros || [],
    prospectosCount,
  };
}

vendedoresRouter.get('/', async (req, res) => {
  const { producto } = req.query as { producto?: string };

  let query: FirebaseFirestore.Query = db.collection('vendedores');
  if (producto && producto !== 'Todos los productos') {
    const productoSnap = await db.collection('productos').where('nombre', '==', producto).limit(1).get();
    query = query.where('productoId', '==', productoSnap.empty ? '__none__' : productoSnap.docs[0].id);
  }

  const snap = await query.get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as VendedorDoc }));
  const productos = await productosPorId(docs.map((d) => d.data.productoId));

  const out = await Promise.all(docs.map((d) => shape(d.id, d.data, productos.get(d.data.productoId))));
  out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json(out);
});

vendedoresRouter.get('/:id', async (req, res) => {
  const doc = await db.collection('vendedores').doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ error: 'not_found' });
  const v = doc.data() as VendedorDoc;
  const productos = await productosPorId([v.productoId]);
  res.json(await shape(doc.id, v, productos.get(v.productoId)));
});

// Configura (o reconfigura) la ruta de un vendedor: producto, zona y giros.
vendedoresRouter.put('/:id/ruta', async (req, res) => {
  const { productoId, ciudad, colonia, giros, drawZone } = req.body as {
    productoId?: string; ciudad?: string; colonia?: string; giros?: string[]; drawZone?: boolean;
  };

  const data: Record<string, unknown> = {};
  if (productoId) data.productoId = productoId;
  if (ciudad !== undefined) data.ciudad = ciudad;
  if (colonia !== undefined) data.colonia = colonia;
  if (drawZone !== undefined) data.drawZone = drawZone;
  if (giros) data.giros = giros;

  const ref = db.collection('vendedores').doc(req.params.id);
  await ref.update(data);

  const doc = await ref.get();
  const v = doc.data() as VendedorDoc;
  const productos = await productosPorId([v.productoId]);
  res.json(await shape(doc.id, v, productos.get(v.productoId)));
});

import { Router } from 'express';
import { db } from '../db.js';
import { productosPorId, shapeVendedor, type VendedorDoc } from './vendedores.js';

export const authRouter = Router();

// A quién pertenece la sesión autenticada: la app del vendedor usa esto en vez
// de un selector manual para saber "quién eres" (se busca el vendedor cuyo
// email coincide con el de la cuenta de Google con la que se inició sesión).
authRouter.get('/me', async (req, res) => {
  const email = req.user!.email;
  const snap = await db.collection('vendedores').where('email', '==', email).limit(1).get();
  if (snap.empty) return res.json({ email, vendedor: null });

  const doc = snap.docs[0];
  const v = doc.data() as VendedorDoc;
  const productos = await productosPorId([v.productoId]);
  res.json({ email, vendedor: await shapeVendedor(doc.id, v, productos.get(v.productoId)) });
});

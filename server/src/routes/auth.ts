import { Router } from 'express';
import { db } from '../db.js';
import { isAdminEmail } from '../auth.js';
import { productosPorId, shapeVendedor, type VendedorDoc } from './vendedores.js';

export const authRouter = Router();

// A quién pertenece la sesión autenticada: la app del vendedor usa "vendedor"
// para saber "quién eres" (se busca el vendedor cuyo email coincide con el de
// la cuenta de Google con la que se inició sesión), y el admin usa "isAdmin"
// para decidir si puede entrar al panel en vez de solo ver un aviso. Un
// vendedor dado de baja en la base de colaboradores responde `baja: true` y
// sin vendedor: la app le explica por qué ya no puede entrar.
authRouter.get('/me', async (req, res) => {
  const email = req.user!.email;
  const [snap, isAdmin] = await Promise.all([
    db.collection('vendedores').where('email', '==', email.toLowerCase()).limit(1).get(),
    isAdminEmail(email),
  ]);
  if (snap.empty) return res.json({ email, vendedor: null, baja: false, isAdmin });

  const doc = snap.docs[0];
  const v = doc.data() as VendedorDoc;
  if (v.estado === 'Baja') return res.json({ email, vendedor: null, baja: true, isAdmin });
  const productos = await productosPorId([v.productoId]);
  res.json({ email, vendedor: shapeVendedor(doc.id, v, productos.get(v.productoId)), baja: false, isAdmin });
});

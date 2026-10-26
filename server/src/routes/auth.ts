import { Router } from 'express';
import { db, Timestamp } from '../db.js';
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

// La app del vendedor avisa que ya vio el recorrido de bienvenida: así no se
// le vuelve a mostrar solo, aunque entre desde otra tablet.
authRouter.post('/onboarding', async (req, res) => {
  const snap = await db.collection('vendedores').where('email', '==', req.user!.email.toLowerCase()).limit(1).get();
  if (snap.empty) return res.status(404).json({ error: 'no_es_vendedor' });
  if (!snap.docs[0].get('onboardingVisto')) await snap.docs[0].ref.update({ onboardingVisto: Timestamp.now() });
  res.status(204).end();
});

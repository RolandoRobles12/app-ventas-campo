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
// El vendedor de esa cuenta. Si hay más de uno con el mismo correo (un
// vendedor de prueba con el correo de alguien que también tuvo un vendedor
// real), manda el de prueba y luego el que esté activo.
async function vendedorDeEmail(email: string) {
  const snap = await db.collection('vendedores').where('email', '==', email.toLowerCase()).limit(5).get();
  const rango = (d: FirebaseFirestore.QueryDocumentSnapshot) => (d.get('estado') === 'Baja' ? 2 : d.get('prueba') ? 0 : 1);
  return [...snap.docs].sort((a, b) => rango(a) - rango(b))[0] ?? null;
}

authRouter.get('/me', async (req, res) => {
  const email = req.user!.email;
  const [doc, isAdmin] = await Promise.all([vendedorDeEmail(email), isAdminEmail(email)]);
  if (!doc) return res.json({ email, vendedor: null, baja: false, isAdmin });

  const v = doc.data() as VendedorDoc;
  if (v.estado === 'Baja') return res.json({ email, vendedor: null, baja: true, isAdmin });
  const productos = await productosPorId([v.productoId]);
  res.json({ email, vendedor: shapeVendedor(doc.id, v, productos.get(v.productoId)), baja: false, isAdmin });
});

// La app del vendedor avisa qué versión de "Novedades" ya vio, para no
// volver a mostrársela aunque entre desde otra tablet.
authRouter.post('/novedades', async (req, res) => {
  const version = String(req.body?.version || '').slice(0, 20);
  if (!version) return res.status(400).json({ error: 'version_requerida' });
  const doc = await vendedorDeEmail(req.user!.email);
  if (!doc) return res.status(404).json({ error: 'no_es_vendedor' });
  await doc.ref.update({ novedadesVistas: version });
  res.status(204).end();
});

// La app del vendedor avisa que ya vio el recorrido de bienvenida: así no se
// le vuelve a mostrar solo, aunque entre desde otra tablet.
authRouter.post('/onboarding', async (req, res) => {
  const doc = await vendedorDeEmail(req.user!.email);
  if (!doc) return res.status(404).json({ error: 'no_es_vendedor' });
  if (!doc.get('onboardingVisto')) await doc.ref.update({ onboardingVisto: Timestamp.now() });
  res.status(204).end();
});

import { Router } from 'express';
import { db } from '../db.js';
import { isRecruitingConfigured, PRODUCTOS_RECRUITING, type ProductoRecruiting } from '../integrations/recruiting.js';
import { GIROS_DENUE } from '../integrations/denue.js';
import { borrarVendedorPrueba, crearVendedorPrueba } from '../prueba.js';
import { guardarConfigEquipo, leerConfigEquipo, leerUltimoReporte, productoIdLocal, sincronizarEquipo } from '../equipo.js';

// Equipo de campo: conexión con la base de colaboradores de aviva-recruiting
// (altas y bajas) y qué productos se consideran "de campo". Solo admin.
export const equipoRouter = Router();

async function estado() {
  const [config, ultimo, productosSnap] = await Promise.all([
    leerConfigEquipo(),
    leerUltimoReporte(),
    db.collection('productos').get(),
  ]);
  const productos = new Map(productosSnap.docs.map((d) => [d.id, d.data() as { giros?: string[] }]));
  return {
    configurado: isRecruitingConfigured(),
    productos: PRODUCTOS_RECRUITING.map((nombre) => {
      const id = productoIdLocal(nombre);
      return { id, nombre, esDeCampo: config.productosCampo.includes(nombre), giros: productos.get(id)?.giros ?? [] };
    }),
    girosDisponibles: GIROS_DENUE,
    ultimo,
  };
}

equipoRouter.get('/', async (_req, res) => {
  res.json(await estado());
});

equipoRouter.post('/sincronizar', async (req, res) => {
  if (!isRecruitingConfigured()) {
    return res.status(501).json({ error: 'RECRUITING_NOT_CONFIGURED', message: 'Configura RECRUITING_PROJECT_ID en el servidor para conectar la base de colaboradores.' });
  }
  try {
    const reporte = await sincronizarEquipo({ origen: 'manual', actor: req.user!.email, forzar: req.body?.forzar === true });
    res.json(reporte);
  } catch (err: any) {
    console.error('Sincronización de equipo falló:', err?.message || err);
    const sinPermiso = /PERMISSION_DENIED|permission/i.test(err?.message || '');
    res.status(502).json({
      error: 'RECRUITING_SYNC_FAILED',
      message: sinPermiso
        ? 'Sin permiso para leer la base de colaboradores: la cuenta de servicio de este proyecto necesita el rol "Cloud Datastore Viewer" en aviva-recruiting (ver README).'
        : (err?.message || 'Error leyendo la base de colaboradores'),
    });
  }
});

// Qué productos son de campo y qué giros busca cada uno en el DENUE.
equipoRouter.put('/productos', async (req, res) => {
  const { productosCampo, giros } = req.body as { productosCampo?: string[]; giros?: Record<string, string[]> };
  if (Array.isArray(productosCampo)) {
    const validos = productosCampo.filter((p): p is ProductoRecruiting => (PRODUCTOS_RECRUITING as readonly string[]).includes(p));
    await guardarConfigEquipo({ productosCampo: validos });
  }
  if (giros && typeof giros === 'object') {
    const ids = new Set(PRODUCTOS_RECRUITING.map(productoIdLocal));
    await Promise.all(Object.entries(giros)
      .filter(([id, lista]) => ids.has(id) && Array.isArray(lista))
      .map(([id, lista]) => db.collection('productos').doc(id).set({
        giros: [...new Set(lista.filter((g) => typeof g === 'string' && g.trim()).map((g) => g.trim()))],
      }, { merge: true })));
  }
  res.json(await estado());
});

// Vendedores de prueba (ver prueba.ts): un admin se da de alta con su propio
// correo para usar la app del vendedor sin ensuciar los indicadores.
const DOMINIO = '@avivacredito.com';

equipoRouter.post('/prueba', async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const productoId = String(req.body?.productoId || '');
  if (!email.endsWith(DOMINIO) || email.length <= DOMINIO.length) return res.status(400).json({ error: 'EMAIL_INVALIDO', message: `Usa un correo ${DOMINIO}.` });
  const producto = productoId ? await db.collection('productos').doc(productoId).get() : null;
  if (!producto?.exists) return res.status(400).json({ error: 'PRODUCTO_INVALIDO', message: 'Elige el producto con el que vas a probar.' });
  const mismos = (await db.collection('vendedores').where('email', '==', email).get()).docs;
  if (mismos.some((d) => d.get('prueba'))) return res.status(409).json({ error: 'YA_EXISTE', message: 'Ya hay un vendedor de prueba con ese correo.' });
  if (mismos.some((d) => d.get('estado') !== 'Baja')) {
    return res.status(409).json({ error: 'VENDEDOR_REAL', message: 'Ese correo es de un vendedor activo: no se puede usar para pruebas.' });
  }
  const nombre = String(req.body?.nombre || '').trim().slice(0, 60) || `Prueba ${email.split('@')[0]}`;
  const id = await crearVendedorPrueba({ email, nombre, productoId }, req.user!.email);
  res.status(201).json({ id });
});

equipoRouter.delete('/prueba/:id', async (req, res) => {
  const doc = await db.collection('vendedores').doc(req.params.id).get();
  if (!doc.exists || !doc.get('prueba')) return res.status(404).json({ error: 'NOT_FOUND', message: 'No es un vendedor de prueba.' });
  res.json({ borrados: await borrarVendedorPrueba(doc.id) });
});

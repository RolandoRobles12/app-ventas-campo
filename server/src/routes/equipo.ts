import { Router } from 'express';
import { db } from '../db.js';
import { isRecruitingConfigured, PRODUCTOS_RECRUITING, type ProductoRecruiting } from '../integrations/recruiting.js';
import { GIROS_DENUE } from '../integrations/denue.js';
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

import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';
import { requireAdmin, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';

export const prospectosRouter = Router();

interface ProspectoDoc {
  vendedorId: string;
  nombre: string;
  direccion: string;
  giro?: string | null;
  distanciaKm?: number | null;
  telefono?: string | null;
  origen: string;
  estado: string;
  lat?: number | null;
  lng?: number | null;
  // Ventana de visita planeada por el admin (ruta semanal/quincenal/mensual
  // con varias zonas): YYYY-MM-DD, ambos inclusive. null = sin programar,
  // que es como se comportaban todos los prospectos antes de esta función —
  // se puede visitar en cualquier momento.
  semanaInicio?: string | null;
  semanaHasta?: string | null;
  createdAt: Timestamp;
}

function shape(id: string, p: ProspectoDoc) {
  return {
    id,
    vendedorId: p.vendedorId,
    nombre: p.nombre,
    direccion: p.direccion,
    giro: p.giro ?? null,
    distanciaKm: p.distanciaKm ?? null,
    telefono: p.telefono ?? null,
    origen: p.origen,
    estado: p.estado,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    semanaInicio: p.semanaInicio ?? null,
    semanaHasta: p.semanaHasta ?? null,
    createdAt: toIso(p.createdAt),
  };
}

// Sin programar (null) primero — se puede visitar en cualquier momento — y
// luego por fecha de inicio programada; dentro de cada grupo, por cercanía.
function porEstadoYSemanaYDistancia(
  a: { estado: string; semanaInicio: string | null; distanciaKm: number | null },
  b: { estado: string; semanaInicio: string | null; distanciaKm: number | null },
) {
  if (a.estado !== b.estado) return a.estado.localeCompare(b.estado);
  if (a.semanaInicio !== b.semanaInicio) {
    if (a.semanaInicio == null) return -1;
    if (b.semanaInicio == null) return 1;
    return a.semanaInicio < b.semanaInicio ? -1 : 1;
  }
  return (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity);
}

// Lista de prospectos de un vendedor (usada por la app del vendedor y por el
// admin). Los leads traen datos de contacto: un vendedor solo puede ver los suyos.
prospectosRouter.get('/vendedor/:vendedorId', async (req, res) => {
  if (!(await puedeActuarComoVendedor(req.user!.email, req.params.vendedorId))) return vendedorAjeno(res);
  const snap = await db.collection('prospectos').where('vendedorId', '==', req.params.vendedorId).get();
  const prospectos = snap.docs
    .map((d) => shape(d.id, d.data() as ProspectoDoc))
    .sort(porEstadoYSemanaYDistancia);
  res.json(prospectos);
});

// Alta manual de un negocio (fuera de lista, o agregado a mano en el wizard de admin)
prospectosRouter.post('/', async (req, res) => {
  const { vendedorId, nombre, direccion, giro, telefono, distanciaKm, lat, lng, origen } = req.body as {
    vendedorId: string; nombre: string; direccion: string; giro?: string; telefono?: string;
    distanciaKm?: number; lat?: number; lng?: number; origen?: string;
  };
  if (!vendedorId || !nombre) return res.status(400).json({ error: 'vendedorId y nombre son requeridos' });
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);

  const data: ProspectoDoc = {
    vendedorId, nombre, direccion: direccion || '', giro: giro ?? null, telefono: telefono ?? null,
    distanciaKm: distanciaKm ?? null, lat: lat ?? null, lng: lng ?? null,
    origen: origen || 'manual', estado: 'por_visitar', createdAt: Timestamp.now(),
  };
  const ref = await db.collection('prospectos').add(data);
  res.status(201).json(shape(ref.id, data));
});

// Alta masiva (resultado del wizard: consulta DENUE + manuales agregados en esa sesión) — solo admin
prospectosRouter.post('/bulk', requireAdmin, async (req, res) => {
  const { vendedorId, items } = req.body as {
    vendedorId: string;
    items: {
      nombre: string; direccion: string; giro?: string; telefono?: string; distanciaKm?: number; lat?: number; lng?: number; origen?: string;
      semanaInicio?: string | null; semanaHasta?: string | null;
    }[];
  };
  if (!vendedorId || !Array.isArray(items)) return res.status(400).json({ error: 'vendedorId e items son requeridos' });

  const existingSnap = await db.collection('prospectos').where('vendedorId', '==', vendedorId).get();
  const existingKeys = new Set(existingSnap.docs.map((d) => {
    const p = d.data() as ProspectoDoc;
    return `${p.nombre}::${p.direccion}`;
  }));
  const nuevos = items.filter((i) => !existingKeys.has(`${i.nombre}::${i.direccion}`));

  if (nuevos.length) {
    const batch = db.batch();
    for (const i of nuevos) {
      const ref = db.collection('prospectos').doc();
      const data: ProspectoDoc = {
        vendedorId, nombre: i.nombre, direccion: i.direccion || '', giro: i.giro ?? null, telefono: i.telefono ?? null,
        distanciaKm: i.distanciaKm ?? null, lat: i.lat ?? null, lng: i.lng ?? null,
        semanaInicio: i.semanaInicio ?? null, semanaHasta: i.semanaHasta ?? null,
        origen: i.origen || 'denue', estado: 'por_visitar', createdAt: Timestamp.now(),
      };
      batch.set(ref, data);
    }
    await batch.commit();
  }

  const snap = await db.collection('prospectos').where('vendedorId', '==', vendedorId).get();
  const prospectos = snap.docs.map((d) => shape(d.id, d.data() as ProspectoDoc)).sort(porEstadoYSemanaYDistancia);
  res.status(201).json({ creados: nuevos.length, prospectos });
});

// Solo admin (el wizard de rutas quita prospectos que ya no aplican a la ruta generada)
prospectosRouter.delete('/:id', requireAdmin, async (req, res) => {
  await db.collection('prospectos').doc(req.params.id).delete().catch(() => null);
  res.status(204).end();
});

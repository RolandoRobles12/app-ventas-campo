import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { fetchAvivaHrUsers, isAvivaHrConfigured, productoParaRole, colorForKey, initialsFor, type ProductoDeCampo } from '../integrations/avivaHr.js';
import { slugify } from '../firestore-helpers.js';

export const vendedoresRouter = Router();

export interface ZonaPunto { lat: number; lng: number }

export interface VendedorDoc {
  nombre: string;
  iniciales: string;
  color: string;
  email: string | null;
  estado: string;
  ciudad: string;
  colonia: string | null;
  drawZone: boolean;
  zonaPoligono?: ZonaPunto[] | null;
  productoId: string;
  giros: string[];
  avivaHrId?: string | null;
}

// Igual que server/src/seed.ts: el id de producto es el slug de su nombre.
// No requiere que el catálogo exista de antemano ni un front para
// administrarlo — la posición de aviva-hr ya trae suficiente información
// (nombre + giros por defecto) para crearlo la primera vez que se necesita.
async function ensureProductoId(producto: ProductoDeCampo): Promise<string> {
  const id = slugify(producto.nombre);
  await db.collection('productos').doc(id).set({ nombre: producto.nombre, esDeCampo: true, giros: producto.giros }, { merge: true });
  return id;
}

export async function productosPorId(ids: string[]): Promise<Map<string, string>> {
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

export async function shapeVendedor(id: string, v: VendedorDoc, productoNombre?: string) {
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
    zonaPoligono: v.zonaPoligono ?? null,
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

  const out = await Promise.all(docs.map((d) => shapeVendedor(d.id, d.data, productos.get(d.data.productoId))));
  out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json(out);
});

// Estado de la integración con aviva-hr (no requiere red: solo checa la config).
vendedoresRouter.get('/externos/status', (_req, res) => {
  res.json({ configured: isAvivaHrConfigured() });
});

// Vista previa de a quién traería una sincronización con aviva-hr, sin escribir
// nada — útil para revisar el mapeo de posiciones antes de importar.
vendedoresRouter.get('/externos', async (_req, res) => {
  if (!isAvivaHrConfigured()) return res.json({ configured: false, candidatos: [] });
  try {
    const [externos, vendedoresSnap] = await Promise.all([
      fetchAvivaHrUsers(),
      db.collection('vendedores').get(),
    ]);
    const emailsImportados = new Set(
      vendedoresSnap.docs.map((d) => (d.data() as VendedorDoc).email?.toLowerCase()).filter(Boolean),
    );
    const candidatos = externos.map((u) => ({
      id: u.id,
      nombre: u.fullName,
      email: u.email,
      role: u.role,
      producto: productoParaRole(u.role)?.nombre ?? null,
      importado: emailsImportados.has(u.email),
    }));
    res.json({ configured: true, candidatos });
  } catch (err: any) {
    res.status(502).json({ error: 'AVIVA_HR_REQUEST_FAILED', message: err?.message || 'Error consultando aviva-hr' });
  }
});

// Importa/actualiza vendedores desde aviva-hr hacia la colección `vendedores`.
// Empareja por email: si ya existe, actualiza nombre/estado/producto pero deja
// intactos ciudad/colonia/drawZone (eso lo sigue configurando el admin a mano
// con "Configurar ruta"). El producto (con sus giros por defecto) se
// auto-provisiona si aún no existe en `productos` — no requiere seed previo.
// Si la posición (role) no mapea a ningún producto de campo conocido, se
// omite en vez de crear un vendedor sin ruta asignable.
vendedoresRouter.post('/importar', async (_req, res) => {
  if (!isAvivaHrConfigured()) {
    return res.status(501).json({ error: 'AVIVA_HR_NOT_CONFIGURED', message: 'Configura AVIVA_HR_PROJECT_ID en el servidor para importar desde aviva-hr.' });
  }
  try {
    const externos = await fetchAvivaHrUsers();
    const vendedoresSnap = await db.collection('vendedores').get();
    const porEmail = new Map(
      vendedoresSnap.docs.map((d) => [((d.data() as VendedorDoc).email || '').toLowerCase(), d.id]),
    );

    let creados = 0;
    let actualizados = 0;
    const omitidos: { email: string; nombre: string; motivo: string }[] = [];

    for (const u of externos) {
      const producto = productoParaRole(u.role);
      if (!producto) {
        omitidos.push({ email: u.email, nombre: u.fullName, motivo: `posición sin mapear: "${u.role}"` });
        continue;
      }
      const productoId = await ensureProductoId(producto);

      const estado = u.status === 'active' ? 'Activo' : 'Pausado';
      const existingId = porEmail.get(u.email);
      if (existingId) {
        await db.collection('vendedores').doc(existingId).update({
          nombre: u.fullName, estado, productoId, avivaHrId: u.id,
        });
        actualizados++;
      } else {
        await db.collection('vendedores').add({
          nombre: u.fullName,
          iniciales: u.initials || initialsFor(u.fullName),
          color: colorForKey(u.colorKey, u.email),
          email: u.email,
          estado,
          ciudad: '',
          colonia: null,
          drawZone: false,
          productoId,
          giros: producto.giros,
          avivaHrId: u.id,
          createdAt: Timestamp.now(),
        });
        creados++;
      }
    }

    res.json({ ok: true, creados, actualizados, omitidos, total: externos.length });
  } catch (err: any) {
    res.status(502).json({ error: 'AVIVA_HR_SYNC_FAILED', message: err?.message || 'Error sincronizando con aviva-hr' });
  }
});

vendedoresRouter.get('/:id', async (req, res) => {
  const doc = await db.collection('vendedores').doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ error: 'not_found' });
  const v = doc.data() as VendedorDoc;
  const productos = await productosPorId([v.productoId]);
  res.json(await shapeVendedor(doc.id, v, productos.get(v.productoId)));
});

// Configura (o reconfigura) la ruta de un vendedor: producto, zona y giros.
vendedoresRouter.put('/:id/ruta', async (req, res) => {
  const { productoId, ciudad, colonia, giros, drawZone, zonaPoligono } = req.body as {
    productoId?: string; ciudad?: string; colonia?: string; giros?: string[]; drawZone?: boolean; zonaPoligono?: ZonaPunto[] | null;
  };

  const data: Record<string, unknown> = {};
  if (productoId) data.productoId = productoId;
  if (ciudad !== undefined) data.ciudad = ciudad;
  if (colonia !== undefined) data.colonia = colonia;
  if (drawZone !== undefined) data.drawZone = drawZone;
  if (zonaPoligono !== undefined) data.zonaPoligono = zonaPoligono && zonaPoligono.length >= 3 ? zonaPoligono : null;
  if (giros) data.giros = giros;

  const ref = db.collection('vendedores').doc(req.params.id);
  await ref.update(data);

  const doc = await ref.get();
  const v = doc.data() as VendedorDoc;
  const productos = await productosPorId([v.productoId]);
  res.json(await shapeVendedor(doc.id, v, productos.get(v.productoId)));
});

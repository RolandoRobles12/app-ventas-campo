import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { fetchAvivaHrUsers, isAvivaHrConfigured, productoParaRole, colorForKey, initialsFor } from '../integrations/avivaHr.js';

export const vendedoresRouter = Router();

export interface VendedorDoc {
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
  avivaHrId?: string | null;
}

async function productoIdPorNombre(nombre: string): Promise<string | null> {
  const snap = await db.collection('productos').where('nombre', '==', nombre).limit(1).get();
  return snap.empty ? null : snap.docs[0].id;
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
      producto: productoParaRole(u.role),
      importado: emailsImportados.has(u.email),
    }));
    res.json({ configured: true, candidatos });
  } catch (err: any) {
    res.status(502).json({ error: 'AVIVA_HR_REQUEST_FAILED', message: err?.message || 'Error consultando aviva-hr' });
  }
});

// Importa/actualiza vendedores desde aviva-hr hacia la colección `vendedores`.
// Empareja por email: si ya existe, actualiza nombre/estado/producto pero deja
// intactos ciudad/colonia/giros/drawZone (eso lo sigue configurando el admin
// a mano con "Configurar ruta"). Si la posición (role) no mapea a un producto
// de campo conocido, se omite en vez de crear un vendedor sin ruta asignable.
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
      const productoNombre = productoParaRole(u.role);
      if (!productoNombre) {
        omitidos.push({ email: u.email, nombre: u.fullName, motivo: `posición sin mapear: "${u.role}"` });
        continue;
      }
      const productoId = await productoIdPorNombre(productoNombre);
      if (!productoId) {
        omitidos.push({ email: u.email, nombre: u.fullName, motivo: `producto "${productoNombre}" no existe en el catálogo` });
        continue;
      }

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
          giros: [],
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
  res.json(await shapeVendedor(doc.id, v, productos.get(v.productoId)));
});

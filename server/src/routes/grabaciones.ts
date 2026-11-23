import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { isEmptyRestriction, parseCsvParam, parseDateRangeQuery, toIso } from '../firestore-helpers.js';
import { puedeActuarComoVendedor, requireAdmin, vendedorAjeno } from '../auth.js';
import { fechaMx, hoyMx, sumarDias } from '../fechas.js';
import { bucket } from '../storageBucket.js';
import { getRecientesPorVendedor, getVendedoresDocs, resolveVendedorIds } from './_filters.js';
import { SESION_ID } from './interacciones.js';

// Grabación de sesiones de la app del vendedor (como Microsoft Clarity, pero
// dentro de la herramienta). La app no graba video: con rrweb guarda la
// estructura de la pantalla y cada cambio, toque y scroll, y aquí se
// reproduce. Los campos de texto van enmascarados y las fotos/mapas
// bloqueados desde la app.
//
// Flujo: la app junta la grabación en fragmentos de ~30 s, los comprime
// (gzip) y los sube directo a Storage en grabaciones/{uid}/{sesionId}/ (las
// reglas solo dejan crear en la carpeta del propio uid y nadie puede leer
// desde el cliente). Después avisa aquí cada fragmento para indexarlo en
// `grabaciones/{sesionId}`. El admin baja los fragmentos a través de esta
// API (Admin SDK), nunca con un enlace público.
export const grabacionesRouter = Router();

// Los fragmentos de más de un mes se borran solos (ver limpiarAnalitica).
export const DIAS_GRABACIONES = 365;
export const DIAS_INTERACCIONES = 365;
const MAX_FRAGMENTOS = 1500;
const MAX_BYTES_FRAGMENTO = 3 * 1024 * 1024;
const MAX_LISTA = 300;
const MAX_DIAS_GRABAR = 14;

export interface Fragmento {
  seq: number; path: string; inicio: number; fin: number; bytes: number; eventos: number;
  toques: number; rabia: number; muertos: number; errores: number; pantallas: string[];
}

export interface GrabacionDoc {
  vendedorId: string;
  uid: string;
  sesionId: string;
  createdAt: Timestamp;
  fin: Timestamp;
  dia: string;
  motivo: 'muestreo' | 'pedida';
  dispositivo: string | null;
  fragmentos: Fragmento[];
  // Totales de todos los fragmentos (para la lista, sin recorrerlos).
  bytes: number; toques: number; rabia: number; muertos: number; errores: number; pantallas: string[];
  actualizadoEn: Timestamp;
}

const entero = (v: unknown, min: number, max: number): number | null => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

// La app avisa que subió un fragmento.
grabacionesRouter.post('/fragmento', async (req, res) => {
  const b = (req.body ?? {}) as Record<string, unknown>;
  const { vendedorId, sesionId, path } = b;
  if (typeof vendedorId !== 'string' || !vendedorId || typeof sesionId !== 'string' || !SESION_ID.test(sesionId) || typeof path !== 'string') {
    return res.status(400).json({ error: 'datos_invalidos', message: 'vendedorId, sesionId y path son requeridos' });
  }
  const uid = req.user!.uid;
  // Solo archivos de la carpeta de esta sesión, subidos con esta misma cuenta.
  const prefijo = `grabaciones/${uid}/${sesionId}/`;
  if (!path.startsWith(prefijo) || !/^[A-Za-z0-9._-]+$/.test(path.slice(prefijo.length))) {
    return res.status(400).json({ error: 'path_invalido', message: 'El fragmento no está en la carpeta de esta sesión.' });
  }
  const ahora = Date.now();
  const seq = entero(b.seq, 0, MAX_FRAGMENTOS - 1);
  const inicio = entero(b.inicio, ahora - 7 * 86_400_000, ahora + 300_000);
  const fin = entero(b.fin, ahora - 7 * 86_400_000, ahora + 300_000);
  const bytes = entero(b.bytes, 1, MAX_BYTES_FRAGMENTO);
  if (seq == null || inicio == null || fin == null || bytes == null || fin < inicio) {
    return res.status(400).json({ error: 'datos_invalidos', message: 'Fragmento con datos inválidos.' });
  }
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);

  const frag: Fragmento = {
    seq, path, inicio, fin, bytes,
    eventos: entero(b.eventos, 0, 1_000_000) ?? 0,
    toques: entero(b.toques, 0, 100_000) ?? 0,
    rabia: entero(b.rabia, 0, 100_000) ?? 0,
    muertos: entero(b.muertos, 0, 100_000) ?? 0,
    errores: entero(b.errores, 0, 100_000) ?? 0,
    pantallas: Array.isArray(b.pantallas) ? [...new Set(b.pantallas.filter((p): p is string => typeof p === 'string').map((p) => p.slice(0, 40)))].slice(0, 20) : [],
  };
  const motivo = b.motivo === 'pedida' ? 'pedida' : 'muestreo';
  const dispositivo = typeof b.dispositivo === 'string' ? b.dispositivo.slice(0, 40) : null;

  const ref = db.collection('grabaciones').doc(sesionId);
  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const prev = snap.data() as GrabacionDoc | undefined;
    if (prev && (prev.vendedorId !== vendedorId || prev.uid !== uid)) return 'ajena' as const;
    // Un reintento del mismo fragmento reemplaza al anterior.
    const fragmentos = [...(prev?.fragmentos ?? []).filter((f) => f.seq !== seq), frag].sort((a, z) => a.seq - z.seq);
    if (fragmentos.length > MAX_FRAGMENTOS) return 'llena' as const;
    const suma = (k: 'bytes' | 'toques' | 'rabia' | 'muertos' | 'errores') => fragmentos.reduce((s, f) => s + f[k], 0);
    const createdAt = Timestamp.fromMillis(Math.min(...fragmentos.map((f) => f.inicio)));
    const data: GrabacionDoc = {
      vendedorId, uid, sesionId, createdAt,
      fin: Timestamp.fromMillis(Math.max(...fragmentos.map((f) => f.fin))),
      dia: fechaMx(createdAt.toDate()),
      motivo: prev?.motivo === 'pedida' ? 'pedida' : motivo,
      dispositivo: prev?.dispositivo ?? dispositivo,
      fragmentos,
      bytes: suma('bytes'), toques: suma('toques'), rabia: suma('rabia'), muertos: suma('muertos'), errores: suma('errores'),
      pantallas: [...new Set(fragmentos.flatMap((f) => f.pantallas))].slice(0, 30),
      actualizadoEn: Timestamp.now(),
    };
    tx.set(ref, data);
    return 'ok' as const;
  });
  if (resultado === 'ajena') return res.status(403).json({ error: 'sesion_ajena', message: 'Esta sesión es de otra cuenta.' });
  if (resultado === 'llena') return res.status(413).json({ error: 'sesion_llena', message: 'La grabación de esta sesión ya llegó a su límite.' });
  res.status(201).json({ ok: true });
});

function shapeLista(id: string, g: GrabacionDoc, nombres: Map<string, { nombre: string; iniciales: string; color: string }>) {
  const v = nombres.get(g.vendedorId);
  return {
    id, vendedorId: g.vendedorId, vendedorNombre: v?.nombre ?? '—', iniciales: v?.iniciales ?? '?', color: v?.color ?? '#8a978f',
    inicio: toIso(g.createdAt), fin: toIso(g.fin), duracionSeg: Math.round((g.fin.toMillis() - g.createdAt.toMillis()) / 1000),
    motivo: g.motivo, dispositivo: g.dispositivo, fragmentos: g.fragmentos.length, bytes: g.bytes,
    toques: g.toques, rabia: g.rabia, muertos: g.muertos, errores: g.errores, pantallas: g.pantallas,
  };
}

async function nombresDe(ids: string[]) {
  const docs = await getVendedoresDocs([...new Set(ids)]);
  return new Map(docs.map((d) => [d.id, { nombre: d.get('nombre') ?? '—', iniciales: d.get('iniciales') ?? '?', color: d.get('color') ?? '#8a978f' }]));
}

// Solo admin: sesiones grabadas del periodo.
grabacionesRouter.get('/', requireAdmin, async (req, res) => {
  const { vendedorIds, productoIds, desde, hasta } = req.query as Record<string, string | undefined>;
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json({ items: [], truncado: false });
  const rango = parseDateRangeQuery(desde, hasta);
  const docs = await getRecientesPorVendedor('grabaciones', ids, MAX_LISTA, (q) => (rango
    ? q.where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end))
    : q));
  const grabs = docs.map((d) => ({ id: d.id, g: d.data() as GrabacionDoc }));
  const nombres = await nombresDe(grabs.map((x) => x.g.vendedorId));
  res.json({ items: grabs.map((x) => shapeLista(x.id, x.g, nombres)), truncado: docs.length >= MAX_LISTA });
});

// Solo admin: el detalle de una sesión (sus fragmentos, para el reproductor).
grabacionesRouter.get('/:sesionId', requireAdmin, async (req, res) => {
  const snap = await db.collection('grabaciones').doc(req.params.sesionId).get();
  if (!snap.exists) return res.status(404).json({ error: 'not_found' });
  const g = snap.data() as GrabacionDoc;
  const nombres = await nombresDe([g.vendedorId]);
  res.json({
    ...shapeLista(snap.id, g, nombres),
    lista: g.fragmentos.map((f) => ({ seq: f.seq, inicio: f.inicio, fin: f.fin, bytes: f.bytes, toques: f.toques, rabia: f.rabia, errores: f.errores, pantallas: f.pantallas })),
  });
});

// Solo admin: un fragmento, tal cual se subió (gzip). El navegador del
// admin lo descomprime.
grabacionesRouter.get('/:sesionId/fragmentos/:seq', requireAdmin, async (req, res) => {
  const snap = await db.collection('grabaciones').doc(req.params.sesionId).get();
  const g = snap.data() as GrabacionDoc | undefined;
  const frag = g?.fragmentos.find((f) => f.seq === Number(req.params.seq));
  if (!frag) return res.status(404).json({ error: 'not_found' });
  try {
    const [contenido] = await bucket().file(frag.path).download();
    res.set('Content-Type', 'application/octet-stream');
    res.set('Cache-Control', 'private, max-age=3600');
    res.send(contenido);
  } catch (err) {
    console.warn(`No se pudo leer el fragmento ${frag.path}:`, (err as Error).message);
    res.status(404).json({ error: 'fragmento_no_disponible', message: 'Este pedazo de la grabación ya no está disponible.' });
  }
});

// Borra una grabación y sus archivos (mejor esfuerzo con Storage).
export async function borrarGrabacion(sesionId: string, g?: GrabacionDoc): Promise<void> {
  const ref = db.collection('grabaciones').doc(sesionId);
  const datos = g ?? ((await ref.get()).data() as GrabacionDoc | undefined);
  if (datos) {
    try {
      await bucket().deleteFiles({ prefix: `grabaciones/${datos.uid}/${sesionId}/` });
    } catch (err) {
      console.warn(`No se pudieron borrar los archivos de la grabación ${sesionId}:`, (err as Error).message);
    }
  }
  await ref.delete();
}

// Todas las grabaciones de un vendedor (al borrar un vendedor de prueba).
export async function borrarGrabacionesDe(vendedorId: string): Promise<number> {
  const snap = await db.collection('grabaciones').where('vendedorId', '==', vendedorId).get();
  for (const d of snap.docs) await borrarGrabacion(d.id, d.data() as GrabacionDoc);
  return snap.size;
}

grabacionesRouter.delete('/:sesionId', requireAdmin, async (req, res) => {
  await borrarGrabacion(req.params.sesionId);
  res.status(204).end();
});

// Solo admin: grabar todas las sesiones de un vendedor por unos días (0 =
// dejar de grabarlo a propósito; sigue entrando en el muestreo general).
grabacionesRouter.put('/vendedor/:vendedorId', requireAdmin, async (req, res) => {
  const dias = entero(req.body?.dias, 0, MAX_DIAS_GRABAR);
  if (dias == null) return res.status(400).json({ error: 'dias_invalidos', message: `Elige entre 0 y ${MAX_DIAS_GRABAR} días.` });
  const ref = db.collection('vendedores').doc(req.params.vendedorId);
  if (!(await ref.get()).exists) return res.status(404).json({ error: 'not_found' });
  const grabarHasta = dias ? sumarDias(hoyMx(), dias - 1) : null;
  await ref.update({ grabarHasta });
  res.json({ grabarHasta });
});

// Limpieza diaria: grabaciones de más de DIAS_GRABACIONES días (con sus
// archivos) y lotes de eventos de más de DIAS_INTERACCIONES días.
export async function limpiarAnalitica(): Promise<{ grabaciones: number; interacciones: number }> {
  const corteGrab = Timestamp.fromMillis(Date.now() - DIAS_GRABACIONES * 86_400_000);
  const corteInt = Timestamp.fromMillis(Date.now() - DIAS_INTERACCIONES * 86_400_000);
  let grabaciones = 0;
  let interacciones = 0;
  for (;;) {
    const snap = await db.collection('grabaciones').where('createdAt', '<', corteGrab).limit(100).get();
    if (snap.empty) break;
    for (const d of snap.docs) await borrarGrabacion(d.id, d.data() as GrabacionDoc);
    grabaciones += snap.size;
  }
  for (;;) {
    const snap = await db.collection('interacciones').where('createdAt', '<', corteInt).limit(400).select().get();
    if (snap.empty) break;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    interacciones += snap.size;
  }
  return { grabaciones, interacciones };
}

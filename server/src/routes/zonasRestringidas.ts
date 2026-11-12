import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { requireAdmin, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { toIso } from '../firestore-helpers.js';
import type { PuntoGeo } from '../integrations/denue.js';
import {
  COLECCION_ZONAS, quitarPendientesDentro, zonasDeVendedor, type ZonaRestringidaDoc,
} from '../zonasRestringidas.js';

// Zonas donde un vendedor no puede ir (ver zonasRestringidas.ts).
//   - GET  /vendedor/:id      → las suyas, para la app del vendedor (sin el
//                               motivo, salvo que el líder decidió mostrarlo).
//   - GET  /                  → todas (admin), para reutilizarlas entre vendedores.
//   - POST /, PUT /:id        → crear / editar (admin). Quita de la ruta de los
//                               vendedores los pendientes que quedan dentro.
//   - DELETE /:id             → borrar (admin).
export const zonasRestringidasRouter = Router();

const MAX_PUNTOS = 200;
const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function shapeAdmin(id: string, z: ZonaRestringidaDoc) {
  return {
    id, nombre: z.nombre, motivo: z.motivo ?? null, mostrarMotivo: !!z.mostrarMotivo,
    puntos: z.puntos, vendedorIds: z.vendedorIds ?? [], actualizadoEn: toIso(z.actualizadoEn ?? z.createdAt ?? null),
  };
}

// Devuelve los campos saneados o un mensaje de error para el admin.
async function leerCuerpo(raw: any): Promise<Omit<ZonaRestringidaDoc, 'creadoPor' | 'createdAt' | 'actualizadoEn'> | string> {
  const puntos: PuntoGeo[] = Array.isArray(raw?.puntos)
    ? raw.puntos.filter((p: any) => p && esNumero(p.lat) && esNumero(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180)
      .slice(0, MAX_PUNTOS).map((p: PuntoGeo) => ({ lat: p.lat, lng: p.lng }))
    : [];
  if (puntos.length < 3) return 'Marca en el mapa al menos 3 esquinas de la zona.';
  const nombre = typeof raw?.nombre === 'string' ? raw.nombre.trim().slice(0, 80) : '';
  if (!nombre) return 'Ponle un nombre a la zona.';
  const motivo = typeof raw?.motivo === 'string' && raw.motivo.trim() ? raw.motivo.trim().slice(0, 200) : null;
  const ids = Array.isArray(raw?.vendedorIds) ? [...new Set(raw.vendedorIds.filter((x: unknown): x is string => typeof x === 'string' && !!x))] as string[] : [];
  if (!ids.length) return 'Elige al menos un vendedor.';
  const existen = await db.getAll(...ids.map((id) => db.collection('vendedores').doc(id)));
  const vendedorIds = existen.filter((d) => d.exists).map((d) => d.id);
  if (!vendedorIds.length) return 'Esos vendedores no existen.';
  return { nombre, motivo, mostrarMotivo: !!motivo && raw?.mostrarMotivo === true, puntos, vendedorIds };
}

zonasRestringidasRouter.get('/vendedor/:vendedorId', async (req, res) => {
  if (!(await puedeActuarComoVendedor(req.user!.email, req.params.vendedorId))) return vendedorAjeno(res);
  const zonas = await zonasDeVendedor(req.params.vendedorId);
  res.json(zonas.map((z) => ({ id: z.id, puntos: z.puntos, mensaje: z.mostrarMotivo ? z.motivo : null })));
});

zonasRestringidasRouter.get('/', requireAdmin, async (_req, res) => {
  const snap = await db.collection(COLECCION_ZONAS).get();
  res.json(snap.docs.map((d) => shapeAdmin(d.id, d.data() as ZonaRestringidaDoc)));
});

zonasRestringidasRouter.post('/', requireAdmin, async (req, res) => {
  const cuerpo = await leerCuerpo(req.body);
  if (typeof cuerpo === 'string') return res.status(400).json({ error: 'ZONA_INVALIDA', message: cuerpo });
  const ahora = Timestamp.now();
  const doc: ZonaRestringidaDoc = { ...cuerpo, creadoPor: req.user!.email, createdAt: ahora, actualizadoEn: ahora };
  const ref = await db.collection(COLECCION_ZONAS).add(doc);
  const quitados = await quitarPendientesDentro(cuerpo.vendedorIds, cuerpo.puntos);
  res.json({ zona: shapeAdmin(ref.id, doc), quitados });
});

// Editar también sirve para aplicarla a más vendedores o quitársela a uno.
// Si ya no le queda ningún vendedor, la zona se borra.
zonasRestringidasRouter.put('/:id', requireAdmin, async (req, res) => {
  const ref = db.collection(COLECCION_ZONAS).doc(req.params.id);
  const actual = await ref.get();
  if (!actual.exists) return res.status(404).json({ error: 'NOT_FOUND', message: 'Esa zona ya no existe.' });
  if (Array.isArray(req.body?.vendedorIds) && !req.body.vendedorIds.length) {
    await ref.delete();
    return res.json({ zona: null, quitados: 0 });
  }
  const previo = actual.data() as ZonaRestringidaDoc;
  const cuerpo = await leerCuerpo({ ...shapeAdmin(actual.id, previo), ...req.body });
  if (typeof cuerpo === 'string') return res.status(400).json({ error: 'ZONA_INVALIDA', message: cuerpo });
  const doc: ZonaRestringidaDoc = { ...previo, ...cuerpo, actualizadoEn: Timestamp.now() };
  await ref.set(doc);
  const quitados = await quitarPendientesDentro(cuerpo.vendedorIds, cuerpo.puntos);
  res.json({ zona: shapeAdmin(ref.id, doc), quitados });
});

zonasRestringidasRouter.delete('/:id', requireAdmin, async (req, res) => {
  await db.collection(COLECCION_ZONAS).doc(req.params.id).delete().catch(() => null);
  res.status(204).end();
});

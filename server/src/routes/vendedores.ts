import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';
import type { RutaConfig } from '../rutas/planificador.js';

export const vendedoresRouter = Router();

export interface ZonaPunto { lat: number; lng: number }

export interface VendedorDoc {
  nombre: string;
  iniciales: string;
  color: string;
  email: string | null;
  // 'Activo' | 'Baja' ('Pausado' solo en vendedores viejos de aviva-hr).
  estado: string;
  productoId: string;
  giros: string[];
  // Datos que vienen de la base de colaboradores de aviva-recruiting (ver equipo.ts).
  puesto?: string;
  zona?: string;
  tienda?: string;
  entidad?: string;
  hubManagerNombre?: string;
  headNombre?: string;
  fuente?: string;
  bajaEn?: Timestamp | null;
  bajaMotivo?: string | null;
  // Zona, giros y ritmo con los que se planeó su última ruta; "Renovar" la reutiliza.
  rutaConfig?: RutaConfig | null;
  // Campos del asistente de rutas anterior: solo se leen para precargar el
  // planeador de un vendedor que todavía no tiene `rutaConfig`.
  ciudad?: string;
  colonia?: string | null;
  zonaPoligonos?: ZonaPunto[][] | null;
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

export function shapeVendedor(id: string, v: VendedorDoc, productoNombre?: string) {
  return {
    id,
    nombre: v.nombre,
    iniciales: v.iniciales,
    color: v.color,
    email: v.email,
    estado: v.estado === 'Baja' ? 'Baja' : 'Activo',
    producto: productoNombre ?? '—',
    productoId: v.productoId,
    giros: v.giros || [],
    puesto: v.puesto ?? null,
    zona: v.zona || v.ciudad || null,
    tienda: v.tienda ?? null,
    hubManagerNombre: v.hubManagerNombre ?? null,
    headNombre: v.headNombre ?? null,
    fuente: v.fuente ?? null,
    bajaEn: toIso(v.bajaEn ?? null),
    bajaMotivo: v.bajaMotivo ?? null,
    rutaConfig: v.rutaConfig ?? null,
    // Para precargar el planeador cuando aún no hay rutaConfig.
    rutaAnterior: v.rutaConfig ? null : {
      etiqueta: [v.colonia, v.ciudad].filter(Boolean).join(', '),
      poligonos: v.zonaPoligonos ?? null,
    },
  };
}

export type VendedorShape = ReturnType<typeof shapeVendedor>;

vendedoresRouter.get('/', async (_req, res) => {
  const snap = await db.collection('vendedores').get();
  const docs = snap.docs.map((d) => ({ id: d.id, data: d.data() as VendedorDoc }));
  const productos = await productosPorId(docs.map((d) => d.data.productoId));
  const out = docs.map((d) => shapeVendedor(d.id, d.data, productos.get(d.data.productoId)));
  out.sort((a, b) => a.nombre.localeCompare(b.nombre));
  res.json(out);
});

vendedoresRouter.get('/:id', async (req, res) => {
  const doc = await db.collection('vendedores').doc(req.params.id).get();
  if (!doc.exists) return res.status(404).json({ error: 'not_found' });
  const v = doc.data() as VendedorDoc;
  const productos = await productosPorId([v.productoId]);
  res.json(shapeVendedor(doc.id, v, productos.get(v.productoId)));
});

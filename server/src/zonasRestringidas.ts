import { db } from './db.js';
import { chunkArray } from './firestore-helpers.js';
import { puntoEnPoligono, type PuntoGeo } from './integrations/denue.js';

// Zonas donde un vendedor no puede visitar ni prospectar. Son por vendedor,
// pero una misma zona se puede aplicar a varios (`vendedorIds`): así se
// dibuja una vez la colonia que se evita y se reutiliza en todo el equipo.
//
// Se hacen cumplir en tres lugares:
//   - el planeador nunca propone negocios que caigan dentro (rutas.ts),
//   - al crear o aplicar una zona se quitan de la ruta los pendientes que ya
//     estaban dentro (quitarPendientesDentro),
//   - el servidor rechaza registrar una visita con GPS dentro (visitas.ts);
//     la app del vendedor lo bloquea antes, con la misma regla.

export interface ZonaRestringidaDoc {
  nombre: string;
  // Interno: el vendedor solo lo ve si el líder marcó `mostrarMotivo`.
  motivo: string | null;
  mostrarMotivo: boolean;
  puntos: PuntoGeo[];
  vendedorIds: string[];
  creadoPor?: string | null;
  createdAt?: FirebaseFirestore.Timestamp;
  actualizadoEn?: FirebaseFirestore.Timestamp;
}

export const COLECCION_ZONAS = 'zonasRestringidas';

// Con GPS impreciso, un punto que cae dentro pero muy cerca del borde puede
// estar en realidad afuera: ahí solo se advierte. El margen es la precisión
// del GPS, con un piso (el GPS nunca es perfecto) y un techo (un fix de red
// de kilómetros no debe volver "borde" toda la zona).
const MARGEN_MIN_M = 25;
const MARGEN_MAX_M = 150;

export function margenBorde(accuracy: number | null | undefined): number {
  const a = Number.isFinite(accuracy) ? Number(accuracy) : MARGEN_MIN_M;
  return Math.min(MARGEN_MAX_M, Math.max(MARGEN_MIN_M, a));
}

// Distancia en metros del punto al contorno del polígono (proyección local
// equirectangular: de sobra para distancias de una colonia).
export function distanciaAlBorde(p: PuntoGeo, poligono: PuntoGeo[]): number {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const xy = (q: PuntoGeo) => ({ x: (q.lng - p.lng) * k * 111_320, y: (q.lat - p.lat) * 110_540 });
  let min = Infinity;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = xy(poligono[j]);
    const b = xy(poligono[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / largo2)) : 0;
    min = Math.min(min, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return min;
}

export type EnZona = { zona: ZonaRestringidaDoc & { id: string }; estado: 'dentro' | 'borde' };

// 'dentro' bloquea; 'borde' solo advierte. null = fuera de todas.
export function evaluarPunto(p: PuntoGeo, accuracy: number | null | undefined, zonas: (ZonaRestringidaDoc & { id: string })[]): EnZona | null {
  let borde: EnZona | null = null;
  for (const zona of zonas) {
    if (zona.puntos.length < 3 || !puntoEnPoligono(p, zona.puntos)) continue;
    if (distanciaAlBorde(p, zona.puntos) > margenBorde(accuracy)) return { zona, estado: 'dentro' };
    borde ??= { zona, estado: 'borde' };
  }
  return borde;
}

export const dentroDeAlguna = (p: { lat?: number | null; lng?: number | null }, poligonos: PuntoGeo[][]): boolean =>
  p.lat != null && p.lng != null && poligonos.some((z) => z.length >= 3 && puntoEnPoligono({ lat: p.lat!, lng: p.lng! }, z));

export async function zonasDeVendedor(vendedorId: string): Promise<(ZonaRestringidaDoc & { id: string })[]> {
  const snap = await db.collection(COLECCION_ZONAS).where('vendedorIds', 'array-contains', vendedorId).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as ZonaRestringidaDoc) }));
}

export async function poligonosDeVendedor(vendedorId: string): Promise<PuntoGeo[][]> {
  return (await zonasDeVendedor(vendedorId)).map((z) => z.puntos);
}

// Quita de la ruta de esos vendedores los negocios pendientes que caen
// dentro de la zona: ya no los podrían visitar.
export async function quitarPendientesDentro(vendedorIds: string[], puntos: PuntoGeo[]): Promise<number> {
  let quitados = 0;
  for (const vendedorId of vendedorIds) {
    const snap = await db.collection('prospectos').where('vendedorId', '==', vendedorId).where('estado', '==', 'por_visitar')
      .select('lat', 'lng').get();
    const dentro = snap.docs.filter((d) => dentroDeAlguna({ lat: d.get('lat'), lng: d.get('lng') }, [puntos]));
    for (const lote of chunkArray(dentro, 400)) {
      const batch = db.batch();
      lote.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    quitados += dentro.length;
  }
  return quitados;
}

import { Timestamp } from './db.js';

export function withId<T extends FirebaseFirestore.DocumentData>(
  snap: FirebaseFirestore.DocumentSnapshot<T> | FirebaseFirestore.QueryDocumentSnapshot<T>,
): (T & { id: string }) | null {
  const data = snap.data();
  if (!data) return null;
  return { id: snap.id, ...data };
}

export function toIso(value: Timestamp | Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

const DIACRITICS = new RegExp('[' + String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f) + ']', 'g');

export function slugify(nombre: string): string {
  return nombre
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Firestore's `in` operator rejects an empty array, así que centralizamos
// el guard que usan todas las rutas filtradas por resolveVendedorIds().
export function isEmptyRestriction(ids: string[] | null): ids is [] {
  return ids !== null && ids.length === 0;
}

// Convierte "desde"/"hasta" (YYYY-MM-DD, ambos inclusive, del filtro de
// fechas del admin) en un rango [start, end) listo para .where('createdAt').
// null = sin filtro de fecha ("Todo").
export function parseDateRangeQuery(desde?: string, hasta?: string): { start: Date; end: Date } | null {
  if (!desde || !hasta) return null;
  const start = new Date(`${desde}T00:00:00`);
  const end = new Date(`${hasta}T00:00:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// Firestore's `in` operator acepta como máximo 30 valores; esto parte un
// arreglo más grande en bloques que se consultan por separado (en paralelo)
// y se combinan después en memoria.
export function chunkArray<T>(arr: T[], size = 30): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

export function haversineMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

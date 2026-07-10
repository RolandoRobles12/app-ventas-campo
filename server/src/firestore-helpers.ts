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

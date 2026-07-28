import { AggregateField } from 'firebase-admin/firestore';
import { db, FieldPath, Timestamp } from '../db.js';
import { chunkArray, isEmptyRestriction } from '../firestore-helpers.js';

// Resuelve el filtro combinado de producto(s)/vendedor(es) del admin a una
// lista de vendedorId para usar en `where('vendedorId', 'in', ids)`.
// null = sin restricción (todos); [] = el filtro no matchea a nadie.
// Si se dan vendedorIds explícitos, mandan sobre productoIds (ya vienen
// acotados a esos productos desde el selector del cliente).
export async function resolveVendedorIds(vendedorIds?: string[], productoIds?: string[]): Promise<string[] | null> {
  if (vendedorIds && vendedorIds.length) return vendedorIds;
  if (productoIds && productoIds.length) {
    const snaps = await Promise.all(
      chunkArray(productoIds).map((c) => db.collection('vendedores').where('productoId', 'in', c).get()),
    );
    return snaps.flatMap((s) => s.docs.map((d) => d.id));
  }
  return null;
}

// La lista que devuelve resolveVendedorIds puede superar los 30 valores que
// acepta el operador `in` de Firestore (basta un producto con 30+ vendedores
// para que la consulta truene con INVALID_ARGUMENT). Los helpers de abajo
// centralizan el patrón bloque-por-bloque + combinación en memoria para las
// tres formas en que las rutas consumen esa lista: contar, sumar y traer docs.

// Cuenta documentos de `coleccion` con `campo in ids`, por bloques.
export async function countChunked(
  coleccion: string,
  campo: string | FirebaseFirestore.FieldPath,
  ids: string[] | null,
  extra: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query = (q) => q,
): Promise<number> {
  if (isEmptyRestriction(ids)) return 0;
  const chunks = ids ? chunkArray(ids) : [null];
  const counts = await Promise.all(chunks.map(async (chunk) => {
    let q: FirebaseFirestore.Query = db.collection(coleccion);
    if (chunk) q = q.where(campo, 'in', chunk);
    return (await extra(q).count().get()).data().count;
  }));
  return counts.reduce((a, b) => a + b, 0);
}

// Suma `campoSuma` sobre documentos con `vendedorId in ids`, por bloques.
export async function sumChunked(
  coleccion: string,
  campoSuma: string,
  ids: string[] | null,
  extra: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query = (q) => q,
): Promise<number> {
  if (isEmptyRestriction(ids)) return 0;
  const chunks = ids ? chunkArray(ids) : [null];
  const sums = await Promise.all(chunks.map(async (chunk) => {
    let q: FirebaseFirestore.Query = db.collection(coleccion);
    if (chunk) q = q.where('vendedorId', 'in', chunk);
    const snap = await extra(q).aggregate({ sum: AggregateField.sum(campoSuma) }).get();
    return (snap.data().sum as number | null) || 0;
  }));
  return sums.reduce((a, b) => a + b, 0);
}

// Docs de la colección `vendedores` por id (todos si ids === null), por bloques.
export async function getVendedoresDocs(ids: string[] | null): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (isEmptyRestriction(ids)) return [];
  if (!ids) return (await db.collection('vendedores').get()).docs;
  const snaps = await Promise.all(chunkArray(ids).map((c) =>
    db.collection('vendedores').where(FieldPath.documentId(), 'in', c).get()));
  return snaps.flatMap((s) => s.docs);
}

// Docs más recientes de `coleccion` con `vendedorId in ids`: cada bloque se
// consulta con el mismo orderBy(createdAt desc) + limit, y el conjunto se
// reordena y recorta en memoria — cualquier doc del top-K global está en el
// top-K de su propio bloque, así que no se pierde ninguno.
export async function getRecientesPorVendedor(
  coleccion: string,
  ids: string[] | null,
  limit: number,
  extra: (q: FirebaseFirestore.Query) => FirebaseFirestore.Query = (q) => q,
): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  if (isEmptyRestriction(ids)) return [];
  const chunks = ids ? chunkArray(ids) : [null];
  const snaps = await Promise.all(chunks.map((chunk) => {
    let q: FirebaseFirestore.Query = db.collection(coleccion);
    if (chunk) q = q.where('vendedorId', 'in', chunk);
    return extra(q).orderBy('createdAt', 'desc').limit(limit).get();
  }));
  const docs = snaps.flatMap((s) => s.docs);
  if (snaps.length === 1) return docs;
  return docs
    .sort((a, b) => (b.data().createdAt as Timestamp).toMillis() - (a.data().createdAt as Timestamp).toMillis())
    .slice(0, limit);
}

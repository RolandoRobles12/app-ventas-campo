import { db } from '../db.js';
import { chunkArray } from '../firestore-helpers.js';

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

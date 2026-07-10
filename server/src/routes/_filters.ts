import { db } from '../db.js';

export async function resolveVendedorIds(producto?: string, vendedor?: string): Promise<string[] | null> {
  // returns null = no restriction (todos); otherwise a list of vendedor ids to filter by
  if (vendedor && vendedor !== 'Todos los vendedores') {
    const snap = await db.collection('vendedores').where('nombre', '==', vendedor).limit(1).get();
    return snap.empty ? [] : [snap.docs[0].id];
  }
  if (producto && producto !== 'Todos los productos') {
    const productoSnap = await db.collection('productos').where('nombre', '==', producto).limit(1).get();
    if (productoSnap.empty) return [];
    const vs = await db.collection('vendedores').where('productoId', '==', productoSnap.docs[0].id).get();
    return vs.docs.map((d) => d.id);
  }
  return null;
}

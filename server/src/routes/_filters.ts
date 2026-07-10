import { prisma } from '../db.js';

export async function resolveVendedorIds(producto?: string, vendedor?: string): Promise<string[] | null> {
  // returns null = no restriction (todos); otherwise a list of vendedor ids to filter by
  if (vendedor && vendedor !== 'Todos los vendedores') {
    const v = await prisma.vendedor.findFirst({ where: { nombre: vendedor } });
    return v ? [v.id] : [];
  }
  if (producto && producto !== 'Todos los productos') {
    const vs = await prisma.vendedor.findMany({ where: { producto: { nombre: producto } } });
    return vs.map((v) => v.id);
  }
  return null;
}

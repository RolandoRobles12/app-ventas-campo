import { db, Timestamp } from './db.js';
import { chunkArray } from './firestore-helpers.js';
import { colorPara, inicialesDe } from './equipo.js';
import { bucket } from './storageBucket.js';
import { borrarGrabacionesDe } from './routes/grabaciones.js';

// Vendedores de prueba: para que un admin use la app del vendedor en
// producción con su propio correo sin ensuciar nada.
//   - La sincronización con la base de colaboradores no los toca (equipo.ts).
//   - No cuentan en Tablero, En vivo, Visitas, Llamadas ni mapas, salvo que
//     se elijan a propósito en el filtro de vendedores (resolveVendedorIds).
//   - No les apartan negocios a los vendedores reales en el planeador ni
//     hacen que un negocio nuevo real salga como "ya era de alguien".
//   - Se borran con todos sus datos desde Equipo.

const MEMO_MS = 60_000;
let memo: { en: number; prueba: Set<string>; reales: string[] } | null = null;

async function leer() {
  if (memo && Date.now() - memo.en < MEMO_MS) return memo;
  const snap = await db.collection('vendedores').select('prueba').get();
  const prueba = new Set(snap.docs.filter((d) => d.get('prueba') === true).map((d) => d.id));
  memo = { en: Date.now(), prueba, reales: snap.docs.filter((d) => !prueba.has(d.id)).map((d) => d.id) };
  return memo;
}

export const invalidarPrueba = () => { memo = null; };
export async function idsDePrueba(): Promise<Set<string>> {
  return (await leer()).prueba;
}
// Todos los vendedores reales, o null si no hay ninguno de prueba (así las
// consultas "de todos" siguen siendo una sola, sin partir por vendedor).
export async function idsReales(): Promise<string[] | null> {
  const m = await leer();
  return m.prueba.size ? m.reales : null;
}

export async function crearVendedorPrueba(datos: { email: string; nombre: string; productoId: string }, actor: string) {
  const ref = db.collection('vendedores').doc();
  await ref.set({
    nombre: datos.nombre, iniciales: inicialesDe(datos.nombre), color: colorPara(datos.email),
    email: datos.email, estado: 'Activo', productoId: datos.productoId, giros: [],
    prueba: true, fuente: 'prueba', creadoPor: actor, createdAt: Timestamp.now(),
  });
  invalidarPrueba();
  return ref.id;
}

// Borra el vendedor de prueba y todo lo que generó. Las zonas restringidas
// compartidas solo pierden a este vendedor.
export async function borrarVendedorPrueba(vendedorId: string): Promise<Record<string, number>> {
  const conteo: Record<string, number> = {};
  conteo.grabaciones = await borrarGrabacionesDe(vendedorId);
  for (const col of ['visitas', 'prospectos', 'llamadas', 'ubicaciones', 'pushTokens', 'solicitudesLigadas', 'interacciones']) {
    const snap = await db.collection(col).where('vendedorId', '==', vendedorId).select().get();
    for (const lote of chunkArray(snap.docs, 400)) {
      const batch = db.batch();
      lote.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
    conteo[col] = snap.size;
  }
  const zonas = await db.collection('zonasRestringidas').where('vendedorIds', 'array-contains', vendedorId).get();
  for (const z of zonas.docs) {
    const quedan = (z.get('vendedorIds') as string[]).filter((id) => id !== vendedorId);
    if (quedan.length) await z.ref.update({ vendedorIds: quedan }); else await z.ref.delete();
  }
  // Fotos de sus visitas (mejor esfuerzo: si Storage no responde, se quedan).
  try {
    await bucket().deleteFiles({ prefix: `visitas/${vendedorId}/` });
  } catch (err) {
    console.warn('No se pudieron borrar las fotos de prueba:', (err as Error).message);
  }
  await db.collection('vendedores').doc(vendedorId).delete();
  invalidarPrueba();
  return conteo;
}

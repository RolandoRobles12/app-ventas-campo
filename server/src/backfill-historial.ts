/**
 * Completa en los datos ya guardados lo que necesita el historial de visitas
 * (ver negocios.ts y POST /visitas), que solo se escribe en lo nuevo:
 *
 *   - prospectos sin `negocioId` → se calcula de su nombre y dirección.
 *   - visitas sin `negocioId` → el de su prospecto (o calculado del nombre y
 *     dirección guardados en la visita, si el prospecto ya no existe).
 *   - visitas sin la foto del vendedor (`vendedorNombre`, `productoId`,
 *     `productoNombre`, `zona`, `hubManagerNombre`) → se toma el dato actual
 *     del vendedor, que es lo más cercano que queda a cómo era al visitar.
 *
 * Solo agrega campos que faltan: nunca cambia uno que ya tiene valor. Se
 * puede correr las veces que sea; la segunda ya no encuentra nada que hacer.
 *
 * Escribe en la base a la que apunten las credenciales actuales — si no está
 * definida FIRESTORE_EMULATOR_HOST, eso es la base REAL de producción. Antes
 * de correrlo con --yes en producción, sácale un respaldo (export de
 * Firestore) y córrelo primero sin --yes para revisar conteos y ejemplos.
 *
 * Uso:
 *   npm run db:backfill-historial              # dry run: cuenta y muestra ejemplos
 *   npm run db:backfill-historial -- --yes     # escribe
 */
import 'dotenv/config';
import { db } from './db.js';
import { chunkArray } from './firestore-helpers.js';
import { negocioIdDe } from './negocios.js';

const ESCRITURAS_POR_LOTE = 400;
const EJEMPLOS = 3;

type Cambio = { ref: FirebaseFirestore.DocumentReference; antes: Record<string, unknown>; cambios: Record<string, unknown> };

async function escribir(cambios: Cambio[]) {
  for (const lote of chunkArray(cambios, ESCRITURAS_POR_LOTE)) {
    const batch = db.batch();
    lote.forEach((c) => batch.update(c.ref, c.cambios));
    await batch.commit();
  }
}

function mostrar(titulo: string, cambios: Cambio[]) {
  console.log(`\n${titulo}: ${cambios.length}`);
  for (const c of cambios.slice(0, EJEMPLOS)) {
    console.log(`  ${c.ref.path}`);
    console.log(`    antes:   ${JSON.stringify(c.antes)}`);
    console.log(`    agrega:  ${JSON.stringify(c.cambios)}`);
  }
}

async function main() {
  const dryRun = !process.argv.slice(2).includes('--yes');
  const destino = process.env.FIRESTORE_EMULATOR_HOST ? `emulador (${process.env.FIRESTORE_EMULATOR_HOST})` : 'PRODUCCIÓN';
  console.log(`Base: ${destino} · ${dryRun ? 'dry run (no escribe nada)' : 'ESCRIBIENDO'}`);

  const [vendedoresSnap, productosSnap, prospectosSnap, visitasSnap] = await Promise.all([
    db.collection('vendedores').get(),
    db.collection('productos').get(),
    db.collection('prospectos').select('negocioId', 'nombre', 'direccion', 'lat', 'lng').get(),
    db.collection('visitas').select('vendedorId', 'prospectoId', 'nombreNegocio', 'direccion', 'lat', 'lng', 'negocioId',
      'vendedorNombre', 'productoId', 'productoNombre', 'zona', 'hubManagerNombre').get(),
  ]);
  const productos = new Map(productosSnap.docs.map((d) => [d.id, d.get('nombre') as string]));
  const vendedores = new Map(vendedoresSnap.docs.map((d) => [d.id, d.data()]));

  // 1. Prospectos.
  const negocioDeProspecto = new Map<string, string>();
  const cambiosProspectos: Cambio[] = [];
  for (const d of prospectosSnap.docs) {
    const p = d.data() as { negocioId?: string; nombre: string; direccion: string; lat?: number | null; lng?: number | null };
    const negocioId = p.negocioId || negocioIdDe(p);
    negocioDeProspecto.set(d.id, negocioId);
    if (!p.negocioId) cambiosProspectos.push({ ref: d.ref, antes: { nombre: p.nombre, direccion: p.direccion }, cambios: { negocioId } });
  }

  // 2. Visitas.
  const cambiosVisitas: Cambio[] = [];
  let sinVendedor = 0;
  for (const d of visitasSnap.docs) {
    const v = d.data();
    const cambios: Record<string, unknown> = {};
    if (!v.negocioId) {
      cambios.negocioId = (v.prospectoId && negocioDeProspecto.get(v.prospectoId))
        || negocioIdDe({ nombre: v.nombreNegocio || '', direccion: v.direccion, lat: v.lat, lng: v.lng });
    }
    if (!v.vendedorNombre) {
      const vendedor = vendedores.get(v.vendedorId);
      if (vendedor) {
        cambios.vendedorNombre = vendedor.nombre ?? '';
        if (v.productoId === undefined) cambios.productoId = vendedor.productoId ?? null;
        if (v.productoNombre === undefined) cambios.productoNombre = productos.get(vendedor.productoId) ?? null;
        if (v.zona === undefined) cambios.zona = vendedor.zona ?? null;
        if (v.hubManagerNombre === undefined) cambios.hubManagerNombre = vendedor.hubManagerNombre ?? null;
      } else {
        sinVendedor++;
      }
    }
    if (Object.keys(cambios).length) {
      cambiosVisitas.push({ ref: d.ref, antes: { vendedorId: v.vendedorId, nombreNegocio: v.nombreNegocio, prospectoId: v.prospectoId ?? null }, cambios });
    }
  }

  console.log(`\nLeídos: ${prospectosSnap.size} prospectos, ${visitasSnap.size} visitas, ${vendedoresSnap.size} vendedores.`);
  mostrar('Prospectos a los que se agrega negocioId', cambiosProspectos);
  mostrar('Visitas a completar', cambiosVisitas);
  if (sinVendedor) console.log(`\n${sinVendedor} visitas son de un vendedor que ya no existe en "vendedores": se les agrega solo el negocioId.`);

  if (dryRun) {
    console.log('\nDry run: no se escribió nada. Corre con --yes para aplicarlo.');
    return;
  }
  await escribir(cambiosProspectos);
  await escribir(cambiosVisitas);
  console.log(`\nListo: ${cambiosProspectos.length} prospectos y ${cambiosVisitas.length} visitas actualizados.`);
}

main().then(() => process.exit(0)).catch((err) => {
  console.error(err);
  process.exit(1);
});

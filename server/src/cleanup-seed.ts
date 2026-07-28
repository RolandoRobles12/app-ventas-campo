/**
 * Borra los datos de ejemplo que crea `seed.ts` (vendedores demo, sus
 * ubicaciones/prospectos/visitas, y los deals CRM `source: 'local'`) de la
 * base de Firestore a la que apunten las credenciales actuales — si no está
 * definida FIRESTORE_EMULATOR_HOST, eso es la base REAL de producción.
 *
 * `jornadas` sigue en la lista de colecciones a limpiar solo para borrar
 * documentos viejos que hayan quedado de antes de quitar esa función —
 * `seed.ts` ya no escribe ahí.
 *
 * Nunca toca: la colección `usuarios` (roles de admin), ni `productos`/`giros`
 * (catálogo real, no datos de actividad).
 *
 * Uso:
 *   npm run db:cleanup-seed                    # dry run: solo lista qué borraría
 *   npm run db:cleanup-seed -- --yes           # borra de verdad
 *   npm run db:cleanup-seed -- --yes --include-rolando
 *     ^ incluye también al vendedor "Rolando Robles" (mismo correo que el
 *       admin que sembró los datos) — por default se excluye porque puede
 *       ser una identidad real de vendedor, no solo dato de ejemplo. Revisa
 *       tú si aplica antes de usar esta bandera.
 */
import 'dotenv/config';
import { db } from './db.js';
import { chunkArray } from './firestore-helpers.js';

const DEMO_EMAILS = [
  'jorge.diaz@avivacredito.com',
  'carlos.vega@avivacredito.com',
  'rolando.robles@avivacredito.com',
  'laura.sanchez@avivacredito.com',
  'maria.lopez@avivacredito.com',
  'miguel.soto@avivacredito.com',
  'ana.ruiz@avivacredito.com',
];

const COLECCIONES_POR_VENDEDOR = ['jornadas', 'ubicaciones', 'prospectos', 'visitas'];

interface VendedorDoc {
  nombre: string;
  email: string | null;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = !args.includes('--yes');
  const includeRolando = args.includes('--include-rolando');

  const emails = DEMO_EMAILS.filter((e) => includeRolando || e !== 'rolando.robles@avivacredito.com');

  const vendedoresSnap = await db.collection('vendedores').get();
  const vendedores = vendedoresSnap.docs
    .map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }))
    .filter((v) => v.email && emails.includes(v.email.toLowerCase()));

  if (!includeRolando) {
    const rolando = vendedoresSnap.docs.find((d) => (d.data() as VendedorDoc).email?.toLowerCase() === 'rolando.robles@avivacredito.com');
    if (rolando) {
      console.log('Nota: se excluyó a "Rolando Robles" (mismo correo que el admin). Usa --include-rolando si también quieres borrarlo.\n');
    }
  }

  if (vendedores.length === 0) {
    console.log('No se encontró ningún vendedor de ejemplo con esos correos. Nada que borrar.');
    return;
  }

  console.log(`Vendedores de ejemplo encontrados (${vendedores.length}):`);
  for (const v of vendedores) console.log(`  - ${v.nombre} <${v.email}> (${v.id})`);

  const vendedorIds = vendedores.map((v) => v.id);
  const refsToDelete: FirebaseFirestore.DocumentReference[] = [];

  for (const col of COLECCIONES_POR_VENDEDOR) {
    for (const chunk of chunkArray(vendedorIds)) {
      const snap = await db.collection(col).where('vendedorId', 'in', chunk).get();
      snap.docs.forEach((d) => refsToDelete.push(d.ref));
    }
  }

  const crmSnap = await db.collection('crmDeals').where('source', '==', 'local').get();
  crmSnap.docs.forEach((d) => refsToDelete.push(d.ref));

  for (const v of vendedores) refsToDelete.push(db.collection('vendedores').doc(v.id));

  const porColeccion = new Map<string, number>();
  for (const ref of refsToDelete) porColeccion.set(ref.parent.id, (porColeccion.get(ref.parent.id) || 0) + 1);

  console.log(`\nTotal de documentos a borrar: ${refsToDelete.length}`);
  for (const [col, count] of porColeccion) console.log(`  - ${col}: ${count}`);

  if (dryRun) {
    console.log('\nEsto fue un DRY RUN — no se borró nada todavía. Vuelve a correr con --yes para borrar de verdad:');
    console.log('  npm run db:cleanup-seed -- --yes');
    return;
  }

  for (const batch of chunkArray(refsToDelete, 400)) {
    const b = db.batch();
    batch.forEach((ref) => b.delete(ref));
    await b.commit();
  }
  console.log('\nListo — se borraron los datos de ejemplo.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

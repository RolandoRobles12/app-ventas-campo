import { db, Timestamp } from './db.js';
import { haversineMetros } from './firestore-helpers.js';

// Señales de que la ubicación de una visita podría no ser real (una app de
// GPS falso, por ejemplo). No bloquean nada: la visita se marca para que el
// líder la revise. Se compara contra el último punto del recorrido que la
// tablet manda cada 5 min (colección `ubicaciones`):
//   - 'salto': para llegar del punto anterior a donde dice la visita habría
//     que ir a más de 150 km/h.
// (La precisión repetida no sirve como señal: la app la redondea a metros
// enteros y un GPS real repite valores seguido.)

export type SospechaGps = 'salto';

const VELOCIDAD_MAX_MS = 150 / 3.6;
// Por debajo de esto, un "salto" puede ser solo el GPS afinándose.
const DISTANCIA_MIN_SALTO_M = 2000;

interface Punto { lat: number; lng: number; createdAt: Timestamp }

export function esSalto(anterior: Punto, visita: { lat: number; lng: number; en: Timestamp }): boolean {
  const metros = haversineMetros(anterior, visita);
  const segundos = Math.max(1, (visita.en.toMillis() - anterior.createdAt.toMillis()) / 1000);
  return metros > DISTANCIA_MIN_SALTO_M && metros / segundos > VELOCIDAD_MAX_MS;
}

export async function sospechasGps(vendedorId: string, visita: { lat: number; lng: number; en: Timestamp }): Promise<SospechaGps[]> {
  const snap = await db.collection('ubicaciones')
    .where('vendedorId', '==', vendedorId)
    .where('createdAt', '<=', visita.en)
    .orderBy('createdAt', 'desc')
    .limit(1)
    .get()
    .catch(() => null);
  const anterior = snap?.docs[0]?.data() as Punto | undefined;
  return anterior && esSalto(anterior, visita) ? ['salto'] : [];
}

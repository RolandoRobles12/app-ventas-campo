import { db } from './db.js';
import { haversineMetros } from './firestore-helpers.js';
import { negocioIdDe, normalizarTexto } from './negocios.js';

// ¿El "negocio nuevo" que registró el vendedor en realidad ya era de alguien?
// Si sí, la visita se guarda, pero no cuenta para su meta de negocios nuevos
// y se le avisa al registrarla.
//
// El negocioId (nombre + dirección) casi nunca coincide: el vendedor escribe
// el nombre y la dirección a su manera, distinto a como vienen en el DENUE.
// Por eso, además del id, se busca por cercanía (≤ 80 m del GPS) y nombre
// parecido. No es infalible, pero atrapa los casos claros.

export type MotivoDuplicado = 'en_tu_ruta' | 'ruta_de_otro' | 'visitado_reciente';

const RADIO_M = 80;
// ~90 m de latitud: la banda en la que se buscan candidatos.
const BANDA_LAT = 0.0008;
const DIAS_RECIENTE = 90;

// Palabras que no distinguen a un negocio de otro ("Abarrotes Lupita" y
// "Abarrotes Mary" no son el mismo).
const GENERICAS = new Set([
  'el', 'la', 'los', 'las', 'de', 'del', 'y', 'e', 'en', 'sa', 'cv', 'rl', 'sc',
  'abarrotes', 'tienda', 'miscelanea', 'ferreteria', 'tlapaleria', 'papeleria', 'estetica', 'salon', 'belleza',
  'taller', 'mecanico', 'mecanica', 'refaccionaria', 'farmacia', 'consultorio', 'fonda', 'cocina', 'comida',
  'tortilleria', 'carniceria', 'panaderia', 'fruteria', 'verduleria', 'cremeria', 'expendio', 'deposito',
  'servicio', 'servicios', 'comercial', 'negocio', 'local', 'super', 'mini',
]);

function palabras(nombre: string): Set<string> {
  return new Set(normalizarTexto(nombre).split(' ').filter((w) => w.length >= 3 && !GENERICAS.has(w)));
}

export function nombresParecidos(a: string, b: string): boolean {
  const na = normalizarTexto(a);
  const nb = normalizarTexto(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const pa = palabras(a);
  const pb = palabras(b);
  // Sin palabras distintivas ("Abarrotes"), solo cuenta si es idéntico.
  if (!pa.size || !pb.size) return false;
  const comunes = [...pa].filter((w) => pb.has(w)).length;
  return comunes / Math.min(pa.size, pb.size) >= 0.5;
}

interface Candidato {
  vendedorId?: string;
  estado?: string;
  nombre?: string;
  lat?: number | null;
  lng?: number | null;
  visitadoEn?: FirebaseFirestore.Timestamp | null;
}

export async function buscarDuplicado(
  vendedorId: string,
  n: { nombre: string; direccion: string; lat: number | null; lng: number | null },
): Promise<MotivoDuplicado | null> {
  const id = negocioIdDe(n);
  const campos = ['vendedorId', 'estado', 'nombre', 'lat', 'lng', 'visitadoEn'];
  const [porId, cercanos] = await Promise.all([
    db.collection('prospectos').where('negocioId', '==', id).select(...campos).get(),
    n.lat != null && n.lng != null
      ? db.collection('prospectos').where('lat', '>=', n.lat - BANDA_LAT).where('lat', '<=', n.lat + BANDA_LAT).select(...campos).get()
      : null,
  ]);
  const candidatos: Candidato[] = [
    ...porId.docs.map((d) => d.data() as Candidato),
    ...(cercanos?.docs ?? []).map((d) => d.data() as Candidato).filter((c) => c.lat != null && c.lng != null
      && haversineMetros({ lat: n.lat!, lng: n.lng! }, { lat: c.lat, lng: c.lng }) <= RADIO_M
      && nombresParecidos(n.nombre, c.nombre || '')),
  ];
  const limite = Date.now() - DIAS_RECIENTE * 86_400_000;
  let motivo: MotivoDuplicado | null = null;
  for (const c of candidatos) {
    if (c.estado === 'por_visitar' && c.vendedorId === vendedorId) return 'en_tu_ruta';
    if (c.estado === 'por_visitar') motivo = 'ruta_de_otro';
    else if (!motivo && (c.visitadoEn?.toMillis() ?? 0) >= limite) motivo = 'visitado_reciente';
  }
  return motivo;
}

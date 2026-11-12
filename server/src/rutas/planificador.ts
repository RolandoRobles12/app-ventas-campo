// Lógica pura del planeador de rutas (sin Firestore ni red): validar la
// configuración que manda el admin, calcular los días de trabajo, ordenar los
// negocios en un recorrido corto y repartirlos por día. La usa
// routes/rutas.ts tanto para "Generar" (vista previa) como para "Renovar".

import { diaSemana, esFechaIso, sumarDias } from '../fechas.js';

export interface PuntoGeo { lat: number; lng: number }

// Una zona de búsqueda: un círculo (centro + radio, o solo el texto que se
// geocodifica) o un contorno dibujado a mano. Una ruta puede juntar varias
// zonas vecinas; el recorrido de cada día pasa por todas.
export interface AreaRuta {
  // Lo que el admin eligió en el buscador ("Col. Centro, Tlaquepaque, Jal.").
  etiqueta: string;
  lat: number | null;
  lng: number | null;
  radioMetros: number;
  // Si hay contorno, manda sobre el círculo.
  poligono: PuntoGeo[] | null;
}

export interface RutaConfig {
  zonas: AreaRuta[];
  giros: string[];
  // Meta total del día. De ella, `propiosPorDia` son negocios nuevos que el
  // vendedor encuentra en la calle: la ruta trae solo la diferencia.
  visitasPorDia: number;
  propiosPorDia: number;
  // 0 = domingo … 6 = sábado.
  dias: number[];
  semanas: number;
}

// Forma vieja (una sola zona: círculo o varios contornos), guardada en
// vendedores.rutaConfig antes de poder juntar zonas. Se sigue leyendo.
interface ZonaVieja {
  etiqueta?: string;
  lat?: number | null;
  lng?: number | null;
  radioMetros?: number;
  poligonos?: PuntoGeo[][] | null;
}

export const DIAS_POR_DEFECTO = [1, 2, 3, 4, 5, 6];
export const RADIO_MIN = 300;
// Tope real del "Buscar" del DENUE de INEGI (ver integrations/denue.ts).
export const RADIO_MAX = 5000;
export const VISITAS_DIA_MAX = 40;
export const SEMANAS_VALIDAS = [1, 2, 3, 4];
export const MAX_ZONAS = 4;

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function puntoValido(p: unknown): p is PuntoGeo {
  const q = p as PuntoGeo;
  return !!q && esNumero(q.lat) && esNumero(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180;
}

const radio = (v: unknown) => Math.min(RADIO_MAX, Math.max(RADIO_MIN, Math.round(Number(v) || 1500)));

function zonasDeConfigVieja(z: ZonaVieja): Partial<AreaRuta>[] {
  const poligonos = Array.isArray(z.poligonos) ? z.poligonos : [];
  if (poligonos.length) return poligonos.map((p, i) => ({ etiqueta: i === 0 ? z.etiqueta : '', lat: null, lng: null, radioMetros: z.radioMetros, poligono: p }));
  return [{ etiqueta: z.etiqueta, lat: z.lat, lng: z.lng, radioMetros: z.radioMetros, poligono: null }];
}

// Devuelve la zona saneada, null si viene vacía (se ignora) o un mensaje.
function normalizarArea(raw: Partial<AreaRuta> | null | undefined, n: number): AreaRuta | null | string {
  const a = raw ?? {};
  const poligono = Array.isArray(a.poligono) ? a.poligono.filter(puntoValido).map(({ lat, lng }) => ({ lat, lng })) : [];
  const tieneCentro = esNumero(a.lat) && esNumero(a.lng);
  const etiqueta = typeof a.etiqueta === 'string' ? a.etiqueta.trim().slice(0, 200) : '';
  if (poligono.length > 0 && poligono.length < 3) return `La zona ${n} dibujada necesita al menos 3 esquinas.`;
  if (!poligono.length && !tieneCentro && !etiqueta) return null;
  return {
    etiqueta,
    lat: tieneCentro ? a.lat! : null,
    lng: tieneCentro ? a.lng! : null,
    radioMetros: radio(a.radioMetros),
    poligono: poligono.length ? poligono : null,
  };
}

// Devuelve la config ya saneada, o un mensaje de error para el admin.
export function normalizarConfig(raw: unknown): RutaConfig | string {
  const c = raw as (Partial<RutaConfig> & { zona?: ZonaVieja }) | null;
  if (!c || typeof c !== 'object') return 'Falta la configuración de la ruta.';
  const crudas: Partial<AreaRuta>[] = Array.isArray(c.zonas) ? c.zonas : c.zona ? zonasDeConfigVieja(c.zona) : [];
  const zonas: AreaRuta[] = [];
  for (const [i, z] of crudas.entries()) {
    const area = normalizarArea(z, i + 1);
    if (typeof area === 'string') return area;
    if (area) zonas.push(area);
  }
  if (!zonas.length) return 'Elige la zona: busca una colonia, C.P. o municipio, o haz clic en el mapa.';
  if (zonas.length > MAX_ZONAS) return `Una ruta puede juntar hasta ${MAX_ZONAS} zonas.`;

  const giros = Array.isArray(c.giros) ? [...new Set(c.giros.filter((g): g is string => typeof g === 'string' && !!g.trim()))] : [];
  if (!giros.length) return 'Elige al menos un giro de negocio.';

  const visitasPorDia = Math.round(Number(c.visitasPorDia));
  if (!Number.isFinite(visitasPorDia) || visitasPorDia < 1 || visitasPorDia > VISITAS_DIA_MAX) return `Las visitas por día deben estar entre 1 y ${VISITAS_DIA_MAX}.`;
  const propiosPorDia = Math.round(Number(c.propiosPorDia ?? 0));
  if (!Number.isFinite(propiosPorDia) || propiosPorDia < 0 || propiosPorDia >= visitasPorDia) {
    return 'Los negocios nuevos que encuentre él deben ser menos que las visitas por día.';
  }

  const dias = Array.isArray(c.dias) ? [...new Set(c.dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : DIAS_POR_DEFECTO;
  if (!dias.length) return 'Elige al menos un día de trabajo.';

  const semanas = Number(c.semanas);
  if (!SEMANAS_VALIDAS.includes(semanas)) return 'La duración debe ser de 1 a 4 semanas.';

  return { zonas, giros, visitasPorDia, propiosPorDia, dias, semanas };
}

// La config guardada de un vendedor (de cualquier forma, vieja o nueva), ya
// en la forma actual; null si no tiene o no es válida.
export function configGuardada(raw: unknown): RutaConfig | null {
  if (!raw) return null;
  const c = normalizarConfig(raw);
  return typeof c === 'string' ? null : c;
}

// Negocios que la ruta trae por día (el resto de la meta, los encuentra él).
export const deRutaPorDia = (c: Pick<RutaConfig, 'visitasPorDia' | 'propiosPorDia'>) => c.visitasPorDia - (c.propiosPorDia || 0);

// "Centro, Tlaquepaque +1" para listas y tablas.
export function etiquetaZonas(c: RutaConfig | null): string | null {
  if (!c?.zonas.length) return null;
  const primera = c.zonas[0].etiqueta || (c.zonas[0].poligono ? 'Zona dibujada' : 'Punto en el mapa');
  return c.zonas.length > 1 ? `${primera} +${c.zonas.length - 1}` : primera;
}

// Primer día >= `desde` que cae en uno de los días de trabajo.
export function siguienteDiaDeTrabajo(desde: string, dias: number[]): string {
  let f = desde;
  for (let i = 0; i < 7 && !dias.includes(diaSemana(f)); i++) f = sumarDias(f, 1);
  return f;
}

// Los días de trabajo dentro de las `semanas` que empiezan en `inicio`.
export function fechasDeTrabajo(inicio: string, semanas: number, dias: number[]): string[] {
  if (!esFechaIso(inicio)) return [];
  const out: string[] = [];
  for (let i = 0; i < semanas * 7; i++) {
    const f = sumarDias(inicio, i);
    if (dias.includes(diaSemana(f))) out.push(f);
  }
  return out;
}

// Distancia aproximada en metros (equirectangular): para comparar distancias
// cortas dentro de una ciudad sobra, y es mucho más barata que haversine en
// los miles de comparaciones del 2-opt.
function distancia(a: PuntoGeo, b: PuntoGeo): number {
  const x = ((b.lng - a.lng) * Math.PI / 180) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const y = (b.lat - a.lat) * Math.PI / 180;
  return Math.sqrt(x * x + y * y) * 6371000;
}

type ConCoords = { lat?: number | null; lng?: number | null };
const coords = (i: ConCoords): PuntoGeo | null => (i.lat != null && i.lng != null ? { lat: i.lat, lng: i.lng } : null);

// Recorrido corto que arranca en `origen`: vecino más cercano y luego 2-opt
// (deshace los cruces). Al partir ese recorrido en tramos consecutivos, cada
// día queda en una zona compacta en vez de saltar de un extremo al otro.
// Los negocios sin coordenadas van al final, en el orden en que llegaron.
export function ordenarRuta<T extends ConCoords>(items: T[], origen: PuntoGeo): T[] {
  const conCoords = items.filter((i) => coords(i));
  const sinCoords = items.filter((i) => !coords(i));

  const pendientes = [...conCoords];
  const ruta: T[] = [];
  let actual = origen;
  while (pendientes.length) {
    let mejor = 0;
    let mejorD = Infinity;
    for (let i = 0; i < pendientes.length; i++) {
      const d = distancia(actual, coords(pendientes[i])!);
      if (d < mejorD) { mejorD = d; mejor = i; }
    }
    const [sig] = pendientes.splice(mejor, 1);
    ruta.push(sig);
    actual = coords(sig)!;
  }

  // 2-opt sobre un camino abierto con inicio fijo en el origen.
  const pts = [origen, ...ruta.map((r) => coords(r)!)];
  const orden = ruta.map((_, i) => i + 1);
  const p = (k: number) => pts[orden[k - 1] ?? 0];
  const n = orden.length;
  for (let pasada = 0, mejoro = true; mejoro && pasada < 25; pasada++) {
    mejoro = false;
    for (let i = 1; i < n; i++) {
      for (let k = i + 1; k <= n; k++) {
        const a = i === 1 ? origen : p(i - 1);
        const antes = distancia(a, p(i)) + (k < n ? distancia(p(k), p(k + 1)) : 0);
        const despues = distancia(a, p(k)) + (k < n ? distancia(p(i), p(k + 1)) : 0);
        if (despues + 0.5 < antes) {
          const tramo = orden.slice(i - 1, k).reverse();
          orden.splice(i - 1, tramo.length, ...tramo);
          mejoro = true;
        }
      }
    }
  }
  return [...orden.map((idx) => ruta[idx - 1]), ...sinCoords];
}

// Parte la lista ya ordenada en bloques de `porDia` y le pone a cada negocio
// su día (`fechaPlan`) y su número de parada en ese día (`orden`). Lo que no
// cabe en los días disponibles se descarta.
export function repartirPorDias<T>(items: T[], fechas: string[], porDia: number): (T & { fechaPlan: string; orden: number })[] {
  const out: (T & { fechaPlan: string; orden: number })[] = [];
  fechas.forEach((fecha, d) => {
    items.slice(d * porDia, (d + 1) * porDia).forEach((item, j) => out.push({ ...item, fechaPlan: fecha, orden: j + 1 }));
  });
  return out;
}

// Lógica pura del planeador de rutas (sin Firestore ni red): validar la
// configuración que manda el admin, calcular los días de trabajo, ordenar los
// negocios en un recorrido corto y repartirlos por día. La usa
// routes/rutas.ts tanto para "Generar" (vista previa) como para "Renovar".

import { diaSemana, esFechaIso, sumarDias } from '../fechas.js';

export interface PuntoGeo { lat: number; lng: number }

export interface ZonaRuta {
  // Lo que el admin eligió en el buscador ("Col. Centro, Tlaquepaque, Jal.").
  etiqueta: string;
  lat: number | null;
  lng: number | null;
  radioMetros: number;
  // Una o varias zonas dibujadas a mano; si hay, mandan sobre el círculo.
  poligonos: PuntoGeo[][] | null;
}

export interface RutaConfig {
  zona: ZonaRuta;
  giros: string[];
  visitasPorDia: number;
  // 0 = domingo … 6 = sábado.
  dias: number[];
  semanas: number;
}

export const DIAS_POR_DEFECTO = [1, 2, 3, 4, 5, 6];
export const RADIO_MIN = 300;
// Tope real del "Buscar" del DENUE de INEGI (ver integrations/denue.ts).
export const RADIO_MAX = 5000;
export const VISITAS_DIA_MAX = 40;
export const SEMANAS_VALIDAS = [1, 2, 3, 4];

const esNumero = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

function puntoValido(p: unknown): p is PuntoGeo {
  const q = p as PuntoGeo;
  return !!q && esNumero(q.lat) && esNumero(q.lng) && Math.abs(q.lat) <= 90 && Math.abs(q.lng) <= 180;
}

// Devuelve la config ya saneada, o un mensaje de error para el admin.
export function normalizarConfig(raw: unknown): RutaConfig | string {
  const c = raw as Partial<RutaConfig> | null;
  if (!c || typeof c !== 'object') return 'Falta la configuración de la ruta.';
  const z = (c.zona ?? {}) as Partial<ZonaRuta>;
  const poligonos = Array.isArray(z.poligonos)
    ? z.poligonos.filter((p) => Array.isArray(p) && p.length >= 3 && p.every(puntoValido)).map((p) => p.map(({ lat, lng }) => ({ lat, lng })))
    : [];
  const tieneCentro = esNumero(z.lat) && esNumero(z.lng);
  const etiqueta = typeof z.etiqueta === 'string' ? z.etiqueta.trim().slice(0, 200) : '';
  if (!poligonos.length && !tieneCentro && !etiqueta) return 'Elige la zona: busca una colonia, C.P. o municipio, o haz clic en el mapa.';

  const giros = Array.isArray(c.giros) ? [...new Set(c.giros.filter((g): g is string => typeof g === 'string' && !!g.trim()))] : [];
  if (!giros.length) return 'Elige al menos un giro de negocio.';

  const visitasPorDia = Math.round(Number(c.visitasPorDia));
  if (!Number.isFinite(visitasPorDia) || visitasPorDia < 1 || visitasPorDia > VISITAS_DIA_MAX) return `Las visitas por día deben estar entre 1 y ${VISITAS_DIA_MAX}.`;

  const dias = Array.isArray(c.dias) ? [...new Set(c.dias.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() : DIAS_POR_DEFECTO;
  if (!dias.length) return 'Elige al menos un día de trabajo.';

  const semanas = Number(c.semanas);
  if (!SEMANAS_VALIDAS.includes(semanas)) return 'La duración debe ser de 1 a 4 semanas.';

  return {
    zona: {
      etiqueta,
      lat: tieneCentro ? z.lat! : null,
      lng: tieneCentro ? z.lng! : null,
      radioMetros: Math.min(RADIO_MAX, Math.max(RADIO_MIN, Math.round(Number(z.radioMetros) || 1500))),
      poligonos: poligonos.length ? poligonos : null,
    },
    giros, visitasPorDia, dias, semanas,
  };
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

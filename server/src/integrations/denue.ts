/**
 * Real integration with INEGI's DENUE (Directorio Estadístico Nacional de Unidades
 * Económicas) public REST API. Docs: https://www.inegi.org.mx/servicios/api_denue.html
 *
 * No mock data: every business name, address and coordinate returned here comes
 * straight from INEGI's response. Requires DENUE_TOKEN in the environment.
 *
 * Búsqueda siempre por GPS+radio real: /Buscar/{condicion}/{lat},{lng}/{radio}/{token}.
 * El DENUE también tiene un modo "por entidad federativa" (código de estado, sin
 * radio real), pero eso obligaba a mantener a mano una tabla ciudad->entidad que
 * solo cubría un puñado de municipios de la ZMG y truena en cualquier otro lugar
 * del país. Como ahora hay vendedores en todo México (import de aviva-hr), el
 * llamador (server/src/routes/denue.ts) geocodifica "ciudad/colonia/C.P." con
 * Google Maps antes de llegar aquí, así que este módulo solo necesita el modo GPS.
 */

import https from 'node:https';
import { haversineMetros } from '../firestore-helpers.js';

const DENUE_BASE = 'https://www.inegi.org.mx/app/api/denue/v1/consulta';

// DENUE's "Buscar" endpoint matches free text against business name / activity
// description, so we translate our internal giro labels into search keywords.
const KEYWORD_POR_GIRO: Record<string, string> = {
  'Comercio de abarrotes': 'abarrotes',
  'Ferretería y tlapalería': 'ferreteria',
  'Papelerías': 'papeleria',
  'Restaurantes y alimentos': 'restaurante',
  'Talleres mecánicos': 'taller mecanico',
  'Estéticas y belleza': 'estetica',
  'Farmacias': 'farmacia',
};

export interface DenueRawResult {
  Id: string;
  Nombre: string;
  Razon_social?: string;
  Clase_actividad?: string;
  Tipo_vialidad?: string;
  Calle?: string;
  Num_Exterior?: string;
  Colonia?: string;
  CP?: string;
  Municipio?: string;
  Localidad?: string;
  Entidad?: string;
  Latitud?: string;
  Longitud?: string;
  Telefono?: string;
}

export interface DenueProspecto {
  nombre: string;
  direccion: string;
  giro: string;
  telefono?: string;
  lat?: number;
  lng?: number;
  distanciaKm?: number;
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim();
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  return haversineMetros(a, b) / 1000;
}

export function isDenueConfigured(): boolean {
  return !!process.env.DENUE_TOKEN;
}

// El DENUE se consulta con node:https en vez de fetch(): fetch() (undici)
// tronaba con "ERR_ASSERTION" contra el API del DENUE específicamente —ese
// mismo proceso sí consulta bien la Geocoding API de Google con fetch(), así
// que el problema es cómo undici interpreta la respuesta del DENUE (INEGI no
// siempre es estrictamente conforme al estándar HTTP), no un bug genérico de
// Node. https, el módulo nativo más antiguo, es más tolerante.
function httpsGetText(url: string, timeoutMs: number): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: timeoutMs }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => resolve({ status: res.statusCode || 0, body: Buffer.concat(chunks).toString('utf-8') }));
      res.on('error', reject);
    });
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado')));
    req.on('error', reject);
  });
}

async function buscarDenue(condicion: string, alcance: string, token: string): Promise<DenueRawResult[]> {
  const url = `${DENUE_BASE}/Buscar/${encodeURIComponent(condicion)}/${alcance}/${token}`;

  let status: number, body: string;
  try {
    // 20s: el DENUE a veces tarda o se cuelga; sin timeout, un request
    // colgado deja "Consultando el DENUE..." girando para siempre.
    ({ status, body } = await httpsGetText(url, 20000));
  } catch (err: any) {
    throw new Error(`No se pudo conectar con el DENUE: ${err?.message || err}`);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`DENUE respondió ${status}: ${body.slice(0, 200)}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch {
    throw new Error(`DENUE respondió algo que no es JSON: ${body.slice(0, 200)}`);
  }
  return Array.isArray(data) ? (data as DenueRawResult[]) : [];
}

// ---------------------------------------------------------------------------
// Filtros de calidad de prospecto (portados de la app de Android de
// Aviva Tu Negocio): descartan giros y cadenas/franquicias que el DENUE
// devuelve por coincidencia de texto pero que no son micronegocios viables.
// ---------------------------------------------------------------------------

const GIROS_EXCLUIDOS = [
  'estacionamiento', 'parking', 'aparcamiento', 'cochera', 'pensión de autos',
  'metrobus', 'transporte', 'autobús', 'camión', 'taxi', 'uber', 'didi', 'arrendadora',
  'renta de autos', 'alquiler', 'vehicular', 'automotriz', 'flotillas', 'logistics',
  'mudanza', 'paquetería', 'mensajería',
  'banco', 'financiera', 'prestamos', 'préstamos', 'crédito', 'seguros', 'casa de cambio',
  'caja de ahorro', 'cooperativa financiera', 'afore', 'inversiones',
  'consultoria', 'consultoría', 'abogado', 'contador', 'notario', 'notaría', 'notarial',
  'notariales', 'gestor', 'asesor', 'arquitecto', 'ingeniero', 'diseñador', 'desarrollador',
  'hospital', 'clínica', 'consultorio', 'doctor', 'médico', 'dentista', 'laboratorio',
  'radiología', 'fisioterapia', 'psicólogo',
  'escuela', 'colegio', 'universidad', 'instituto', 'academia', 'guardería', 'kinder',
  'preescolar', 'primaria', 'secundaria', 'preparatoria',
  'inmobiliaria', 'bienes raíces', 'desarrolladora', 'fraccionamiento', 'residencial',
  'condominios', 'departamentos',
  'gobierno', 'municipal', 'delegación', 'secretaría', 'instituto nacional', 'comisión',
  'organismo', 'dependencia', 'oficina gubernamental',
];

const PALABRAS_COMIDA = [
  'restaurant', 'restaurante', 'taqueria', 'taquería', 'comida', 'cocina', 'antojitos',
  'mariscos', 'pozole', 'birria', 'tacos', 'tortas', 'hamburguesas', 'pizza', 'sushi',
  'cafeteria', 'cafetería', 'cantina', 'bar', 'cerveza', 'comedor', 'fonda', 'cenaduria',
  'loncheria', 'quesadillas', 'tamales', 'elotes', 'raspados', 'nieves', 'helados', 'cafe',
  'café', 'coffee', 'bebidas', 'jugos', 'licuados', 'aguas', 'refrescos', 'botanero',
  'cerveceria', 'cervecería', 'wings', 'alitas', 'carnitas', 'barbacoa', 'mole',
  'enchiladas', 'chilaquiles', 'flautas', 'tostadas', 'sopes', 'huaraches', 'gorditas',
];

const CADENAS_Y_FRANQUICIAS = [
  // conveniencia
  'oxxo', 'seven eleven', '7 eleven', 'circle k', 'extra', 'kiosko', 'modelorama', 'six',
  "super willys", "willy's", 'ampm', 'go mart',
  // supermercados
  'walmart', 'soriana', 'chedraui', 'mega', 'superama', 'bodega aurrera', 'comercial mexicana',
  'calimax', 'heb', 'costco', 'sams', 'city club',
  // comida rápida
  'mcdonalds', "mcdonald's", 'burger king', 'kfc', 'subway', 'dominos', "domino's", 'pizza hut',
  'starbucks', "carl's jr", 'taco bell', 'little caesars', 'papa johns', 'pollo feliz',
  'pollo loco', "church's", 'kentucky', 'wendys', "wendy's",
  // farmacias
  'farmacia guadalajara', 'farmacias del ahorro', 'farmacia benavides', 'farmacia san pablo',
  'farmacia similares', 'dr simi', 'farmacia yza',
  // ferreterías / materiales / muebles
  'home depot', 'comex', 'sherwin williams', 'novaceramic', 'interceramic', 'liverpool',
  'palacio de hierro', 'elektra', 'coppel',
  // panaderías industriales
  'wonder', 'bimbo', 'marinela', 'tia rosa', 'globo', 'donuts krispy',
];

const INDICADORES_EMPRESA_GRANDE = [
  's.a. de c.v.', 'sa de cv', 'sociedad anonima', 'sociedad anónima', 'corporativo', 'grupo',
  'holding', 'internacional', 'enterprise', 'corporation', 'sucursal', 'franquicia', 'cadena',
  'matriz', 'subsidiaria',
];

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Coincidencia por palabra completa, no substring: "bar" no debe disparar con
// "abarrotes", ni "auto" con "autoservicio". Cada entrada de las listas de
// abajo puede ser una palabra o frase ("home depot"); \b delimita ambos lados.
function containsWord(texto: string, palabras: string[]): boolean {
  return palabras.some((p) => new RegExp(`\\b${escapeRegExp(normalize(p))}\\b`).test(texto));
}

function esCadenaOFranquicia(nombre: string, direccion: string): boolean {
  const texto = normalize(`${nombre} ${direccion}`);
  if (containsWord(texto, CADENAS_Y_FRANQUICIAS)) return true;
  if (containsWord(texto, INDICADORES_EMPRESA_GRANDE)) return true;
  if (/#\d+|\bno\.?\s*\d+|\bsucursal\s*\d+/.test(texto)) return true;
  return false;
}

function esGiroExcluido(nombre: string, direccion: string, claseActividad: string): boolean {
  const texto = normalize(`${nombre} ${direccion} ${claseActividad}`);
  return containsWord(texto, GIROS_EXCLUIDOS);
}

// El giro "Restaurantes y alimentos" sí busca comida a propósito; para
// cualquier otro giro, un match de comida suele ser ruido del texto libre
// del DENUE (ej. la cafetería de un hospital que ya excluimos por otro lado).
function esComidaNoDeseada(nombre: string, claseActividad: string, giro: string): boolean {
  if (giro === 'Restaurantes y alimentos') return false;
  const texto = normalize(`${nombre} ${claseActividad}`);
  return containsWord(texto, PALABRAS_COMIDA);
}

export interface UbicacionGps {
  lat: number;
  lng: number;
  radioMetros?: number;
}

export interface PuntoGeo {
  lat: number;
  lng: number;
}

// Ray casting: cuenta cuántas veces un rayo horizontal desde el punto hacia
// la derecha cruza los lados del polígono; un número impar de cruces
// significa que el punto quedó dentro del contorno.
export function puntoEnPoligono(punto: PuntoGeo, poligono: PuntoGeo[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const xi = poligono[i].lng, yi = poligono[i].lat;
    const xj = poligono[j].lng, yj = poligono[j].lat;
    const cruza = yi > punto.lat !== yj > punto.lat
      && punto.lng < ((xj - xi) * (punto.lat - yi)) / (yj - yi) + xi;
    if (cruza) dentro = !dentro;
  }
  return dentro;
}

// El DENUE no soporta buscar "dentro de un polígono": su único modo real de
// búsqueda geográfica es punto+radio. Para que el polígono dibujado en el
// wizard sí tenga efecto, lo envolvemos en el círculo más chico que lo cubre
// (centro = centroide de los vértices, radio = distancia al vértice más
// lejano + 15% de margen) para la consulta al DENUE, y luego los resultados
// se filtran con puntoEnPoligono() para quedarnos solo con los que caen
// realmente dentro del contorno dibujado, no solo dentro del círculo.
export function centroYRadioDePoligono(poligono: PuntoGeo[]): UbicacionGps {
  const lat = poligono.reduce((s, p) => s + p.lat, 0) / poligono.length;
  const lng = poligono.reduce((s, p) => s + p.lng, 0) / poligono.length;
  const centro = { lat, lng };
  const radioVertices = Math.max(...poligono.map((p) => haversineMetros(centro, p)));
  // Mismo tope de 10000m que ya usa el campo "Radio (m)" del modo GPS: un
  // círculo más grande que eso vuelve la búsqueda al DENUE lenta o propensa
  // a timeout sin ganar precisión real (el filtro por polígono ya recorta
  // lo que sobra del círculo).
  const radioMetros = Math.min(10000, Math.max(300, Math.round(radioVertices * 1.15)));
  return { lat, lng, radioMetros };
}

export async function consultarDenue(opts: {
  giros: string[];
  cantidad: number;
  ubicacion: UbicacionGps;
  poligono?: PuntoGeo[];
}): Promise<DenueProspecto[]> {
  const token = process.env.DENUE_TOKEN;
  if (!token) {
    throw new Error('DENUE_NOT_CONFIGURED');
  }

  const giros = opts.giros.length ? opts.giros : ['Comercio de abarrotes'];
  const cantidad = Math.max(1, Math.min(200, opts.cantidad || 10));
  const ubicacion = opts.ubicacion;
  const centro = { lat: ubicacion.lat, lng: ubicacion.lng };

  const seen = new Set<string>();
  const merged: DenueProspecto[] = [];

  // En paralelo, no secuencial: con varios giros seleccionados, un solo
  // request lento/colgado ya no bloquea a los demás — antes, un giro atorado
  // a mitad de la lista dejaba la búsqueda entera esperando su timeout de 20s
  // antes de siquiera intentar los giros restantes.
  const porGiro = await Promise.allSettled(giros.map(async (giro) => {
    const keyword = KEYWORD_POR_GIRO[giro] || normalize(giro);
    const alcance = `${ubicacion.lat},${ubicacion.lng}/${ubicacion.radioMetros || 1500}`;
    return { giro, raw: await buscarDenue(keyword, alcance, token) };
  }));

  const errores: string[] = [];
  for (const resultado of porGiro) {
    if (resultado.status === 'rejected') {
      errores.push(resultado.reason?.message || String(resultado.reason));
      continue;
    }
    const { giro, raw } = resultado.value;
    for (const r of raw) {
      if (seen.has(r.Id)) continue;

      const nombre = r.Nombre || r.Razon_social || 'Negocio sin nombre';
      const calle = [r.Tipo_vialidad, r.Calle, r.Num_Exterior].filter(Boolean).join(' ');
      const direccion = [calle, r.Colonia, r.Municipio].filter(Boolean).join(', ') || nombre;
      const claseActividad = r.Clase_actividad || '';

      if (esGiroExcluido(nombre, direccion, claseActividad)) continue;
      if (esComidaNoDeseada(nombre, claseActividad, giro)) continue;
      if (esCadenaOFranquicia(nombre, direccion)) continue;

      seen.add(r.Id);

      const lat = r.Latitud ? parseFloat(r.Latitud) : undefined;
      const lng = r.Longitud ? parseFloat(r.Longitud) : undefined;
      const distanciaKm = lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
        ? Math.round(haversineKm(centro, { lat, lng }) * 10) / 10
        : undefined;

      merged.push({
        nombre,
        direccion: direccion || 'Ubicación actual',
        giro,
        telefono: r.Telefono || undefined,
        lat, lng, distanciaKm,
      });
    }
  }

  // Si TODOS los giros fallaron no hay nada que mostrar — ahí sí conviene
  // fallar con el motivo real. Si al menos uno funcionó, mejor mostrar lo que
  // se encontró que descartar una búsqueda parcialmente exitosa.
  if (merged.length === 0 && errores.length > 0 && errores.length === giros.length) {
    throw new Error(errores[0]);
  }

  // El DENUE ya respondió con el círculo que envuelve el polígono (ver
  // centroYRadioDePoligono); aquí se descarta lo que cayó dentro del círculo
  // pero fuera del contorno real que dibujó el usuario. Sin lat/lng no hay
  // forma de ubicar el resultado, así que ante la duda se descarta.
  const dentroDeZona = opts.poligono && opts.poligono.length >= 3
    ? merged.filter((p) => p.lat != null && p.lng != null && puntoEnPoligono({ lat: p.lat, lng: p.lng }, opts.poligono!))
    : merged;

  dentroDeZona.sort((a, b) => (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity));
  return dentroDeZona.slice(0, cantidad);
}

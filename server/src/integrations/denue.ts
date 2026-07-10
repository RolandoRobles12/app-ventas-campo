/**
 * Real integration with INEGI's DENUE (Directorio Estadístico Nacional de Unidades
 * Económicas) public REST API. Docs: https://www.inegi.org.mx/servicios/api_denue.html
 *
 * No mock data: every business name, address and coordinate returned here comes
 * straight from INEGI's response. Requires DENUE_TOKEN in the environment.
 */

const DENUE_BASE = 'https://www.inegi.org.mx/app/api/denue/v1/consulta';

// Jalisco is the only state used by the seeded vendor cities today; extend as
// new cities/states are onboarded. Entidad 0 = búsqueda nacional (fallback).
const ENTIDAD_POR_CIUDAD: Record<string, string> = {
  guadalajara: '14',
  zapopan: '14',
  tlaquepaque: '14',
  tonala: '14',
  tlajomulco: '14',
};

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

// Approximate reference point per city, used only to sort DENUE's real results
// by proximity (haversine distance) — INEGI's "Buscar" endpoint does not accept
// a lat/lng center, so we can't ask it to sort server-side.
const CENTRO_POR_CIUDAD: Record<string, { lat: number; lng: number }> = {
  guadalajara: { lat: 20.6597, lng: -103.3496 },
  zapopan: { lat: 20.7214, lng: -103.3913 },
  tlaquepaque: { lat: 20.6402, lng: -103.312 },
  tonala: { lat: 20.6231, lng: -103.2346 },
  tlajomulco: { lat: 20.4737, lng: -103.4425 },
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
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function isDenueConfigured(): boolean {
  return !!process.env.DENUE_TOKEN;
}

async function buscarPorGiro(giro: string, ciudad: string, token: string): Promise<DenueRawResult[]> {
  const keyword = KEYWORD_POR_GIRO[giro] || normalize(giro);
  const entidad = ENTIDAD_POR_CIUDAD[normalize(ciudad)] || '0';
  const condicion = encodeURIComponent(keyword);
  const url = `${DENUE_BASE}/Buscar/${condicion}/${entidad}/${token}`;

  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`DENUE respondió ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as DenueRawResult[];
  return Array.isArray(data) ? data : [];
}

export async function consultarDenue(opts: {
  giros: string[];
  ciudad: string;
  colonia?: string;
  cantidad: number;
}): Promise<DenueProspecto[]> {
  const token = process.env.DENUE_TOKEN;
  if (!token) {
    throw new Error('DENUE_NOT_CONFIGURED');
  }

  const giros = opts.giros.length ? opts.giros : ['Comercio de abarrotes'];
  const cantidad = Math.max(1, Math.min(60, opts.cantidad || 10));
  const centro = CENTRO_POR_CIUDAD[normalize(opts.ciudad)];
  const coloniaFilter = opts.colonia ? normalize(opts.colonia) : null;

  const seen = new Set<string>();
  const merged: DenueProspecto[] = [];

  for (const giro of giros) {
    let raw: DenueRawResult[];
    try {
      raw = await buscarPorGiro(giro, opts.ciudad, token);
    } catch (err) {
      // Propagate real transport/auth errors from INEGI (invalid token, rate limit, etc.)
      throw err;
    }

    for (const r of raw) {
      if (seen.has(r.Id)) continue;
      if (coloniaFilter) {
        const col = normalize(r.Colonia || '');
        const cp = (r.CP || '').trim();
        if (!col.includes(coloniaFilter) && cp !== opts.colonia?.trim()) continue;
      }
      seen.add(r.Id);

      const lat = r.Latitud ? parseFloat(r.Latitud) : undefined;
      const lng = r.Longitud ? parseFloat(r.Longitud) : undefined;
      const distanciaKm = centro && lat != null && lng != null && !Number.isNaN(lat) && !Number.isNaN(lng)
        ? Math.round(haversineKm(centro, { lat, lng }) * 10) / 10
        : undefined;

      const calle = [r.Tipo_vialidad, r.Calle, r.Num_Exterior].filter(Boolean).join(' ');
      const direccion = [calle, r.Colonia, r.Municipio || opts.ciudad].filter(Boolean).join(', ');

      merged.push({
        nombre: r.Nombre || r.Razon_social || 'Negocio sin nombre',
        direccion: direccion || opts.ciudad,
        giro,
        telefono: r.Telefono || undefined,
        lat, lng, distanciaKm,
      });
    }
  }

  merged.sort((a, b) => (a.distanciaKm ?? Infinity) - (b.distanciaKm ?? Infinity));
  return merged.slice(0, cantidad);
}

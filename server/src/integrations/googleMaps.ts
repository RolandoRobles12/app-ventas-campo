/**
 * Geocoding real vía Google Maps: convierte texto libre (ciudad, colonia y/o
 * código postal — cualquier combinación, incluido C.P. solo) en lat/lng.
 *
 * Existe porque el DENUE no tiene un modo de búsqueda "por zona de texto"
 * real: solo acepta un código de entidad federativa (estado) o coordenadas +
 * radio. Antes traducíamos "ciudad" a un código de entidad a mano para un
 * puñado de municipios de la ZMG, lo cual truena para cualquier otra ciudad
 * del país (y para búsquedas por C.P. sin ciudad). Geocodificar con Google y
 * alimentar el modo por GPS del DENUE (que sí funciona en todo México)
 * resuelve ambas cosas sin duplicar la lógica de búsqueda de negocios.
 *
 * Requiere GOOGLE_MAPS_API_KEY con la Geocoding API habilitada en Google Cloud.
 */

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';

export function isGoogleMapsConfigured(): boolean {
  return !!process.env.GOOGLE_MAPS_API_KEY;
}

export interface GeocodeResult {
  lat: number;
  lng: number;
  direccionFormateada: string;
}

interface GeocodeResponse {
  status: string;
  error_message?: string;
  results: Array<{
    geometry: { location: { lat: number; lng: number } };
    formatted_address: string;
  }>;
}

export async function geocodificar(direccion: string): Promise<GeocodeResult | null> {
  const key = process.env.GOOGLE_MAPS_API_KEY;
  if (!key) throw new Error('GOOGLE_MAPS_NOT_CONFIGURED');

  const url = `${GEOCODE_URL}?address=${encodeURIComponent(direccion)}&components=country:MX&key=${key}`;
  const res = await fetch(url);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Google Maps respondió ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = (await res.json()) as GeocodeResponse;
  if (data.status === 'ZERO_RESULTS') return null;
  if (data.status !== 'OK') {
    throw new Error(`Google Maps: ${data.status}${data.error_message ? ` — ${data.error_message}` : ''}`);
  }
  const top = data.results[0];
  return {
    lat: top.geometry.location.lat,
    lng: top.geometry.location.lng,
    direccionFormateada: top.formatted_address,
  };
}

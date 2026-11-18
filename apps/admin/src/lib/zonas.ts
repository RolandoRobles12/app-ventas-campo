import type { RutaConfig, ZonaPunto } from '../api';

// Ray casting: ¿el punto cae dentro del contorno?
export function puntoEnPoligono(p: ZonaPunto, poligono: ZonaPunto[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) dentro = !dentro;
  }
  return dentro;
}

export const dentroDeAlguna = (p: { lat?: number | null; lng?: number | null }, poligonos: ZonaPunto[][]) =>
  p.lat != null && p.lng != null && poligonos.some((z) => z.length >= 3 && puntoEnPoligono({ lat: p.lat!, lng: p.lng! }, z));

export function distanciaKm(a: ZonaPunto, b: ZonaPunto): number {
  const x = ((b.lng - a.lng) * Math.PI / 180) * Math.cos(((a.lat + b.lat) / 2) * Math.PI / 180);
  const y = (b.lat - a.lat) * Math.PI / 180;
  return Math.sqrt(x * x + y * y) * 6371;
}

export const centroide = (pts: ZonaPunto[]): ZonaPunto => ({
  lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length,
  lng: pts.reduce((s, p) => s + p.lng, 0) / pts.length,
});

// "Centro, Tlaquepaque +1" para listas y tablas.
export function etiquetaZonas(c: RutaConfig | null | undefined): string | null {
  if (!c?.zonas?.length) return null;
  const primera = c.zonas[0].etiqueta || (c.zonas[0].poligono ? 'Zona dibujada' : 'Punto en el mapa');
  return c.zonas.length > 1 ? `${primera} +${c.zonas.length - 1}` : primera;
}

// Círculo como contorno de `lados` esquinas: así una zona restringida
// elegida con el buscador + radio se guarda igual que una dibujada.
export function circuloComoPoligono(centro: ZonaPunto, radioM: number, lados = 32): ZonaPunto[] {
  const dLat = radioM / 110_540;
  const dLng = radioM / (111_320 * Math.cos((centro.lat * Math.PI) / 180));
  return Array.from({ length: lados }, (_, i) => {
    const a = (2 * Math.PI * i) / lados;
    return { lat: +(centro.lat + dLat * Math.sin(a)).toFixed(6), lng: +(centro.lng + dLng * Math.cos(a)).toFixed(6) };
  });
}

// Con el buscador, la zona restringida es un círculo alrededor del lugar
// elegido (se guarda como contorno).
export function conCentro<T extends { radio: number }>(z: T, centro: ZonaPunto, radio = z.radio): T & { centro: ZonaPunto; puntos: ZonaPunto[] } {
  return { ...z, centro, radio, puntos: circuloComoPoligono(centro, radio) };
}

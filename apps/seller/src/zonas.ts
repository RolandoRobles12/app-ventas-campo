import { useEffect, useState } from 'react';
import { api } from './api';

// Zonas donde el vendedor no puede visitar ni prospectar (las marca su líder
// en el planeador). Se guardan en el teléfono para que el bloqueo funcione
// también sin señal; el servidor aplica la misma regla al recibir la visita.

export interface ZonaRestringida {
  id: string;
  puntos: { lat: number; lng: number }[];
  // El motivo, solo si el líder decidió mostrarlo.
  mensaje: string | null;
}

const llave = (vendedorId: string) => `aviva.zonasRestringidas.${vendedorId}`;

export function zonasEnCache(vendedorId: string): ZonaRestringida[] {
  try {
    return JSON.parse(localStorage.getItem(llave(vendedorId)) || '[]') as ZonaRestringida[];
  } catch {
    return [];
  }
}

const EVENTO = 'aviva:zonas-cambiaron';

// Una sola petición a la vez, aunque varias pantallas la pidan juntas.
let enCurso: Promise<void> | null = null;

export function actualizarZonas(vendedorId: string): Promise<void> {
  enCurso ??= pedirZonas(vendedorId).finally(() => { enCurso = null; });
  return enCurso;
}

async function pedirZonas(vendedorId: string): Promise<void> {
  try {
    const zonas = await api.zonasRestringidas(vendedorId);
    try { localStorage.setItem(llave(vendedorId), JSON.stringify(zonas)); } catch { /* sin espacio: queda la copia anterior */ }
    window.dispatchEvent(new Event(EVENTO));
  } catch {
    // Sin señal: se queda con la última copia.
  }
}

export function useZonasRestringidas(vendedorId: string | undefined): ZonaRestringida[] {
  const [zonas, setZonas] = useState<ZonaRestringida[]>(() => (vendedorId ? zonasEnCache(vendedorId) : []));
  useEffect(() => {
    if (!vendedorId) return;
    const leer = () => setZonas(zonasEnCache(vendedorId));
    leer();
    window.addEventListener(EVENTO, leer);
    // Cada pantalla que las usa pide la versión más reciente (si hay señal):
    // así funciona aunque el vendedor entre directo, sin pasar por "Hoy".
    actualizarZonas(vendedorId);
    return () => window.removeEventListener(EVENTO, leer);
  }, [vendedorId]);
  return zonas;
}

function puntoEnPoligono(p: { lat: number; lng: number }, poligono: { lat: number; lng: number }[]): boolean {
  let dentro = false;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = poligono[i];
    const b = poligono[j];
    if (a.lat > p.lat !== b.lat > p.lat && p.lng < ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng) dentro = !dentro;
  }
  return dentro;
}

function distanciaAlBorde(p: { lat: number; lng: number }, poligono: { lat: number; lng: number }[]): number {
  const k = Math.cos((p.lat * Math.PI) / 180);
  const xy = (q: { lat: number; lng: number }) => ({ x: (q.lng - p.lng) * k * 111_320, y: (q.lat - p.lat) * 110_540 });
  let min = Infinity;
  for (let i = 0, j = poligono.length - 1; i < poligono.length; j = i++) {
    const a = xy(poligono[j]);
    const b = xy(poligono[i]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const largo2 = dx * dx + dy * dy;
    const t = largo2 ? Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / largo2)) : 0;
    min = Math.min(min, Math.hypot(a.x + t * dx, a.y + t * dy));
  }
  return min;
}

// Mismo margen que el servidor (zonasRestringidas.ts): cerca del borde, con
// GPS impreciso, puede estar afuera; ahí solo se advierte.
const margen = (accuracy: number | null | undefined) => Math.min(150, Math.max(25, accuracy ?? 25));

export type EnZona = { zona: ZonaRestringida; estado: 'dentro' | 'borde' };

// 'dentro' bloquea; 'borde' solo advierte; null = fuera.
export function evaluarZona(pos: { lat: number; lng: number; accuracy?: number | null } | null, zonas: ZonaRestringida[]): EnZona | null {
  if (!pos) return null;
  let borde: EnZona | null = null;
  for (const zona of zonas) {
    if (zona.puntos.length < 3 || !puntoEnPoligono(pos, zona.puntos)) continue;
    if (distanciaAlBorde(pos, zona.puntos) > margen(pos.accuracy)) return { zona, estado: 'dentro' };
    borde ??= { zona, estado: 'borde' };
  }
  return borde;
}

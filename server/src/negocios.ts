import { createHash } from 'node:crypto';

// Identidad estable de un negocio, independiente del vendedor que lo tenga en
// su ruta: así su historial de visitas sigue completo aunque cambie de
// vendedor o el vendedor deje de estar activo.
//
// Es un hash del nombre y la dirección normalizados (sin acentos, mayúsculas
// ni puntuación). El DENUE devuelve siempre el mismo nombre y dirección para
// un negocio, así que un negocio que ya estaba en una ruta vieja (guardada
// sin este campo) y el mismo negocio en una ruta nueva comparten id; el id
// del DENUE se guarda aparte (denueId) como referencia.
//
// Un negocio nuevo que el vendedor registró sin dirección ("Ubicación
// actual") se identifica por nombre + GPS redondeado a ~100 m, para no
// juntar a todas las "Tienda Lupita" del país en una sola.

const SIN_DIRECCION = new Set(['', 'ubicacion actual']);

export function normalizarTexto(s: string | null | undefined): string {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();
}

export function negocioIdDe(n: { nombre: string; direccion?: string | null; lat?: number | null; lng?: number | null }): string {
  const nombre = normalizarTexto(n.nombre);
  let lugar = normalizarTexto(n.direccion);
  if (SIN_DIRECCION.has(lugar) && n.lat != null && n.lng != null) lugar = `${n.lat.toFixed(3)},${n.lng.toFixed(3)}`;
  return `n-${createHash('sha1').update(`${nombre}::${lugar}`).digest('hex').slice(0, 20)}`;
}

export const esNegocioIdValido = (id: unknown): id is string => typeof id === 'string' && /^n-[0-9a-f]{20}$/.test(id);

import type { CSSProperties } from 'react';

const base: CSSProperties = { fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, display: 'inline-block', whiteSpace: 'nowrap' };

// Un color fijo por producto (mismos nombres que la base de colaboradores de
// aviva-recruiting); uno desconocido cae en gris.
const PRODUCTO_COLORES: Record<string, [string, string]> = {
  'Aviva tu Negocio': ['#2a6fdb', '#e2ecfb'],
  'Casa Marchand': ['#a83292', '#f6e2f1'],
  Construrama: ['#0e8a8a', '#d7f0f0'],
  'Bodega Aurrera': ['#3d7a1f', '#e3f1d9'],
  "Walmart y Sam's": ['#1d5fae', '#dde9f8'],
  'Kiosco Aviva': ['#a3471d', '#f7e4da'],
};

export function prodBadgeStyle(p: string): CSSProperties {
  const [color, background] = PRODUCTO_COLORES[p] ?? ['#5a665f', '#eef2ee'];
  return { ...base, color, background };
}

export function estadoBadgeStyle(estado: string): CSSProperties {
  const b = { ...base, fontWeight: 600 as const };
  if (estado === 'Activo') return { ...b, color: '#1c7a4f', background: '#dcf1e5' };
  if (estado === 'Baja') return { ...b, color: '#a8322a', background: '#fbe3e0' };
  return { ...b, color: '#2a6fdb', background: '#e2ecfb' };
}

// Mismos colores que los resultados de la app del vendedor
// (apps/seller/src/resultados.tsx), para que se reconozcan igual en ambos lados.
export function resultadoBadgeStyle(resultado: string): CSSProperties {
  if (resultado === 'Se realizó solicitud') return { ...base, color: '#0f5132', background: '#dcf1e5' };
  if (resultado === 'Se dejó información') return { ...base, color: '#c96a1e', background: '#fdecdb' };
  if (resultado === 'Cliente no interesado') return { ...base, color: '#c0392b', background: '#fbe3e0' };
  if (resultado === 'No es un negocio válido o existente') return { ...base, color: '#5a665f', background: '#eef2ee' };
  if (resultado === 'Se reagenda visita') return { ...base, color: '#2a6fdb', background: '#e2ecfb' };
  return { ...base, color: '#3a4a41', background: '#eef2ee' };
}

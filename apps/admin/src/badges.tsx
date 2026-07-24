import type { CSSProperties } from 'react';

const base: CSSProperties = { fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20, display: 'inline-block', whiteSpace: 'nowrap' };

export function prodBadgeStyle(p: string): CSSProperties {
  if (p === 'Aviva Tu Negocio') return { ...base, color: '#2a6fdb', background: '#e2ecfb' };
  if (p === 'Aviva Casa Marchand') return { ...base, color: '#a83292', background: '#f6e2f1' };
  return { ...base, color: '#0e8a8a', background: '#d7f0f0' };
}

export function etapaBadgeStyle(e: string): CSSProperties {
  if (e === 'Documentos subidos') return { ...base, color: '#2a6fdb', background: '#e2ecfb' };
  if (e === 'Documentos verificados') return { ...base, color: '#0e8a8a', background: '#d7f0f0' };
  if (e === 'Aprobado') return { ...base, color: '#1c7a4f', background: '#dcf1e5' };
  if (e === 'Contrato enviado') return { ...base, color: '#c96a1e', background: '#fdecdb' };
  if (e === 'Desembolso') return { ...base, color: '#0f5132', background: '#cdefda' };
  return { ...base, color: '#c0392b', background: '#fbe3e0' };
}

export function estadoBadgeStyle(estado: string): CSSProperties {
  const b = { ...base, fontWeight: 600 as const };
  if (estado === 'Activo' || estado === 'Finalizó' || estado === 'Aprobado') return { ...b, color: '#1c7a4f', background: '#dcf1e5' };
  if (estado === 'Pausado' || estado === 'Sin iniciar') return { ...b, color: '#c96a1e', background: '#fdecdb' };
  return { ...b, color: '#2a6fdb', background: '#e2ecfb' };
}

// Mismos colores que RESULTADO_COLOR en server/src/routes/dashboard.ts —
// duplicado a propósito, es un valor puramente de presentación en el cliente.
export function resultadoBadgeStyle(resultado: string): CSSProperties {
  if (resultado === 'Se realizó solicitud') return { ...base, color: '#0f5132', background: '#dcf1e5' };
  if (resultado === 'Se dejó información') return { ...base, color: '#c96a1e', background: '#fdecdb' };
  if (resultado === 'Cliente no interesado') return { ...base, color: '#c0392b', background: '#fbe3e0' };
  if (resultado === 'No es un negocio válido o existente') return { ...base, color: '#5a665f', background: '#eef2ee' };
  if (resultado === 'Se reagenda visita') return { ...base, color: '#2a6fdb', background: '#e2ecfb' };
  return { ...base, color: '#3a4a41', background: '#eef2ee' };
}

export function estadoProspectoBadgeStyle(estado: string): CSSProperties {
  const b: CSSProperties = { fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20 };
  if (estado === 'visitado') return { ...b, color: '#1c7a4f', background: '#dcf1e5' };
  return { ...b, color: '#c96a1e', background: '#fdecdb' };
}

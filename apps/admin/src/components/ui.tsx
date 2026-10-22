import { useState, type CSSProperties, type ReactNode } from 'react';

// Piezas visuales que repiten todas las pantallas del admin.

// `paddingEncabezado`: para tarjetas cuyo cuerpo va de orilla a orilla
// (tablas con padding 0 a los lados), el título conserva su propio margen.
export function Card({ titulo, subtitulo, accion, children, style, padding = '18px 20px', paddingEncabezado }: {
  titulo?: ReactNode; subtitulo?: ReactNode; accion?: ReactNode; children: ReactNode; style?: CSSProperties;
  padding?: string | number; paddingEncabezado?: string;
}) {
  return (
    <section style={{ background: '#fff', border: '1px solid #e3eae5', borderRadius: 12, padding, ...style }}>
      {(titulo || accion) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 14, padding: paddingEncabezado }}>
          <div>
            {titulo && <h2 style={{ margin: 0, fontSize: 15.5, fontWeight: 600, color: '#263238' }}>{titulo}</h2>}
            {subtitulo && <div style={{ fontSize: 12.5, color: '#8a978f', marginTop: 3 }}>{subtitulo}</div>}
          </div>
          {accion}
        </div>
      )}
      {children}
    </section>
  );
}

// Ícono ⓘ que muestra una explicación al pasar el cursor o al hacer clic.
export function Ayuda({ texto }: { texto: string }) {
  const [abierta, setAbierta] = useState(false);
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }} onMouseEnter={() => setAbierta(true)} onMouseLeave={() => setAbierta(false)}>
      <button
        type="button" aria-label="¿Qué significa?" onClick={() => setAbierta((x) => !x)}
        style={{ width: 17, height: 17, borderRadius: '50%', border: '1.5px solid #9aa39c', background: '#fff', color: '#6f7d75', fontSize: 11, fontWeight: 700, lineHeight: 1, padding: 0, cursor: 'help', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
      >i</button>
      {abierta && (
        <span style={{
          position: 'absolute', top: 'calc(100% + 8px)', left: '50%', transform: 'translateX(-50%)', zIndex: 50, width: 300,
          background: '#1f2a24', color: '#eef3ef', borderRadius: 10, padding: '11px 13px', fontSize: 12.5, fontWeight: 400, lineHeight: 1.5,
          whiteSpace: 'pre-line', boxShadow: '0 8px 24px rgba(0,0,0,.22)', textAlign: 'left',
        }}>{texto}</span>
      )}
    </span>
  );
}

// Indicador de una sola cifra: etiqueta, valor y una línea de contexto.
export function StatTile({ label, value, sub, tono = 'neutro', ayuda }: {
  label: string; value: ReactNode; sub?: ReactNode; tono?: 'bien' | 'mal' | 'neutro'; ayuda?: string;
}) {
  const color = tono === 'bien' ? '#1c7a4f' : tono === 'mal' ? '#b23a2b' : '#6f7d75';
  return (
    <div style={{ background: '#fff', border: '1px solid #e3eae5', borderRadius: 12, padding: '16px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, color: '#5a665f', fontWeight: 500 }}>
        {label}
        {ayuda && <Ayuda texto={ayuda} />}
      </div>
      <div style={{ fontSize: 32, fontWeight: 600, color: '#1f2a24', marginTop: 6, lineHeight: 1.1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12.5, fontWeight: 500, color, marginTop: 6 }}>{sub}</div>}
    </div>
  );
}

export function Avatar({ color, iniciales, size = 34 }: { color: string; iniciales: string; size?: number }) {
  return (
    <span style={{ width: size, height: size, flex: 'none', borderRadius: '50%', background: color, color: '#fff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: size * 0.37, fontWeight: 600 }}>
      {iniciales}
    </span>
  );
}

// Barra de avance con severidad: el color lo pone qué tan cerca está de la
// meta, y el número siempre va en texto al lado (el color nunca va solo).
export function Medidor({ pct, ancho = 90 }: { pct: number | null; ancho?: number }) {
  if (pct == null) return <span style={{ color: '#9aa39c' }}>—</span>;
  const color = pct >= 85 ? '#22a36c' : pct >= 60 ? '#e0a526' : '#d64545';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: ancho, height: 8, borderRadius: 4, background: '#edf1ee', overflow: 'hidden' }}>
        <span style={{ display: 'block', height: '100%', width: `${Math.min(100, pct)}%`, background: color, borderRadius: 4 }} />
      </span>
      <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#263238', minWidth: 36 }}>{pct}%</span>
    </span>
  );
}

export const boton = {
  primario: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#157347', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  secundario: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fff', color: '#0f5132', border: '1px solid #cfdcd3', borderRadius: 8, padding: '9px 14px', fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  suave: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#eef3ef', color: '#3a4a41', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
  peligro: { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, background: '#fbe3e0', color: '#a8322a', border: 'none', borderRadius: 8, padding: '9px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' } as CSSProperties,
};

export function Aviso({ tono = 'info', children, accion }: { tono?: 'info' | 'alerta' | 'error' | 'ok'; children: ReactNode; accion?: ReactNode }) {
  const t = {
    info: ['#eef4fb', '#c9dbf3', '#1d4f8f'],
    alerta: ['#fff5ea', '#ffd9b5', '#94500f'],
    error: ['#fdeeec', '#f3c3bc', '#a8322a'],
    ok: ['#ecf8f0', '#bfe6cf', '#14623b'],
  }[tono];
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: t[0], border: `1px solid ${t[1]}`, color: t[2], borderRadius: 10, padding: '11px 14px', fontSize: 13, lineHeight: 1.5 }}>
      <div style={{ flex: 1 }}>{children}</div>
      {accion}
    </div>
  );
}

export function Modal({ titulo, subtitulo, onClose, children, pie, ancho = 520 }: {
  titulo: string; subtitulo?: string; onClose: () => void; children: ReactNode; pie?: ReactNode; ancho?: number;
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,40,30,.42)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: ancho, maxWidth: 'calc(100vw - 40px)', maxHeight: 'calc(100vh - 60px)', overflowY: 'auto', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.28)' }}>
        <div style={{ padding: '18px 22px', borderBottom: '1px solid #eef2ee' }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: '#263238' }}>{titulo}</div>
          {subtitulo && <div style={{ fontSize: 12.5, color: '#8a978f', marginTop: 3 }}>{subtitulo}</div>}
        </div>
        <div style={{ padding: '18px 22px' }}>{children}</div>
        {pie && <div style={{ padding: '14px 22px', borderTop: '1px solid #eef2ee', display: 'flex', justifyContent: 'flex-end', gap: 10 }}>{pie}</div>}
      </div>
    </div>
  );
}

// Encabezado de columna que ordena la tabla al hacer clic.
export function ThOrden<K extends string>({ k, orden, setOrden, children, alinear = 'left' }: {
  k: K; orden: { k: K; desc: boolean }; setOrden: (o: { k: K; desc: boolean }) => void; children: ReactNode; alinear?: 'left' | 'right';
}) {
  const activo = orden.k === k;
  return (
    <button
      onClick={() => setOrden({ k, desc: activo ? !orden.desc : true })}
      style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', color: activo ? '#0f5132' : 'inherit', cursor: 'pointer', textAlign: alinear, width: '100%', fontWeight: 'inherit', letterSpacing: 'inherit' }}
    >
      {children}{activo ? (orden.desc ? ' ↓' : ' ↑') : ''}
    </button>
  );
}

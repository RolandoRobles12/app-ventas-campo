import { useCallback, useEffect, useRef, useState } from 'react';

// Recorrido guiado sobre la pantalla real: oscurece todo menos un elemento
// (marcado con data-tour="…") y explica para qué sirve. Lo usan la app del
// vendedor y el panel de admin. El "hueco" es una sombra enorme alrededor
// del elemento: barato de dibujar incluso en tablets de gama baja.

export interface PasoRecorrido {
  // Valor de data-tour del elemento a resaltar.
  objetivo: string;
  titulo: string;
  texto: string;
}

const MARGEN = 8;
const ESPERA_PANTALLA_MS = 450;

const elementoDe = (objetivo: string) => document.querySelector<HTMLElement>(`[data-tour="${objetivo}"]`);

export function Recorrido({ pasos, onTerminar, grande = false, color = '#0f5132' }: {
  pasos: PasoRecorrido[];
  onTerminar: () => void;
  // Letra y botones más grandes (app del vendedor, en tablet).
  grande?: boolean;
  color?: string;
}) {
  // Solo los pasos cuyo elemento existe (p. ej. sin "siguiente parada" si ya
  // no queda ninguna); se calcula después de que la pantalla terminó de pintar.
  const [visibles, setVisibles] = useState<PasoRecorrido[] | null>(null);
  const [i, setI] = useState(0);
  const [caja, setCaja] = useState<DOMRect | null>(null);
  const terminarRef = useRef(onTerminar);
  terminarRef.current = onTerminar;
  const terminar = useCallback(() => terminarRef.current(), []);

  useEffect(() => {
    const t = setTimeout(() => {
      const v = pasos.filter((p) => elementoDe(p.objetivo));
      if (!v.length) terminar();
      else setVisibles(v);
    }, ESPERA_PANTALLA_MS);
    return () => clearTimeout(t);
    // Solo al abrir: los pasos de un recorrido no cambian a la mitad.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const paso = visibles?.[i];

  const medir = useCallback(() => {
    const el = paso && elementoDe(paso.objetivo);
    setCaja(el ? el.getBoundingClientRect() : null);
  }, [paso]);

  useEffect(() => {
    if (!paso) return;
    elementoDe(paso.objetivo)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    medir();
    // Se vuelve a medir cuando termina el desplazamiento suave.
    const t = setTimeout(medir, 380);
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [paso, medir]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') terminar(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [terminar]);

  if (!visibles || !paso) return null;
  const ultimo = i === visibles.length - 1;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ancho = Math.min(grande ? 420 : 340, vw - 32);
  // La tarjeta va debajo del elemento si cabe; si no, arriba; si el
  // elemento es muy alto, abajo de la pantalla.
  const altoAprox = grande ? 250 : 200;
  let top: number;
  if (!caja) top = vh / 2 - altoAprox / 2;
  else if (caja.bottom + MARGEN + 12 + altoAprox < vh) top = caja.bottom + MARGEN + 12;
  else if (caja.top - MARGEN - 12 - altoAprox > 0) top = caja.top - MARGEN - 12 - altoAprox;
  else top = vh - altoAprox - 16;
  const left = caja ? Math.min(Math.max(16, caja.left + caja.width / 2 - ancho / 2), vw - ancho - 16) : (vw - ancho) / 2;

  const f = grande ? { titulo: 21, texto: 16, paso: 13, boton: 16, alto: 50 } : { titulo: 16, texto: 13.5, paso: 11.5, boton: 13.5, alto: 38 };

  return (
    <div role="dialog" aria-modal="true" aria-label={paso.titulo} style={{ position: 'fixed', inset: 0, zIndex: 1000 }}>
      {/* Atrapa los toques: durante el recorrido no se usa la pantalla de abajo. */}
      <div style={{ position: 'absolute', inset: 0, background: caja ? 'transparent' : 'rgba(10,25,17,.62)' }} />
      {caja && (
        <div style={{
          position: 'absolute', top: caja.top - MARGEN, left: caja.left - MARGEN, width: caja.width + MARGEN * 2, height: caja.height + MARGEN * 2,
          borderRadius: 16, boxShadow: '0 0 0 9999px rgba(10,25,17,.62)', border: '3px solid #8fe3b6', pointerEvents: 'none',
          transition: 'top .25s ease, left .25s ease, width .25s ease, height .25s ease',
        }} />
      )}
      <div key={i} style={{
        position: 'absolute', top, left, width: ancho, background: '#fff', borderRadius: 18, padding: grande ? '18px 18px 16px' : '14px 16px 12px',
        boxShadow: '0 16px 40px rgba(0,0,0,.28)', animation: 'aviva-recorrido .2s ease-out',
      }}>
        <style>{'@keyframes aviva-recorrido { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }'}</style>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontSize: f.paso, fontWeight: 800, letterSpacing: '.6px', color: '#6f7d75' }}>PASO {i + 1} DE {visibles.length}</span>
          <button onClick={terminar} style={{ background: 'none', border: 'none', padding: '6px 4px', fontSize: f.paso + 1, fontWeight: 700, color: '#6f7d75', cursor: 'pointer', fontFamily: 'inherit' }}>
            Saltar recorrido
          </button>
        </div>
        <div style={{ fontSize: f.titulo, fontWeight: 800, color: '#161a17', marginTop: 4, lineHeight: 1.25 }}>{paso.titulo}</div>
        <div style={{ fontSize: f.texto, fontWeight: 500, color: '#3a4a41', marginTop: 6, lineHeight: 1.5 }}>{paso.texto}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: grande ? 16 : 12 }}>
          <div style={{ flex: 1, display: 'flex', gap: 5 }}>
            {visibles.map((_, j) => (
              <span key={j} style={{ width: j === i ? 18 : 7, height: 7, borderRadius: 4, background: j === i ? color : '#d5e0d8', transition: 'width .2s' }} />
            ))}
          </div>
          {i > 0 && (
            <button onClick={() => setI(i - 1)} style={{ minHeight: f.alto, padding: '0 14px', borderRadius: 12, border: 'none', background: '#eef5f0', color, fontSize: f.boton, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}>
              Atrás
            </button>
          )}
          <button
            onClick={() => (ultimo ? terminar() : setI(i + 1))}
            style={{ minHeight: f.alto, padding: '0 18px', borderRadius: 12, border: 'none', background: color, color: '#fff', fontSize: f.boton, fontWeight: 800, cursor: 'pointer', fontFamily: 'inherit' }}
          >
            {ultimo ? '¡Listo!' : 'Siguiente'}
          </button>
        </div>
      </div>
    </div>
  );
}

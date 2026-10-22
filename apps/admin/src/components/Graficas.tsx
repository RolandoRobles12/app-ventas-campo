import { useState } from 'react';
import { etiquetaDia } from '../lib/dateRanges';

// Gráficas del admin hechas con HTML simple (sin librería): una sola serie,
// un solo tono para la magnitud, barras delgadas con la punta redondeada y
// el valor exacto al pasar el cursor.

const VERDE = '#157347';
const VERDE_SUAVE = '#7cc49c';

const compacto = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}K` : String(n));

// "lun 3" por día; "3 nov" por semana.
function etiquetaEje(iso: string, porSemana: boolean): string {
  const [dia, num, mes] = etiquetaDia(iso, false).split(' ');
  return porSemana ? `${num} ${mes}` : `${dia} ${num}`;
}

function pasoLimpio(max: number): number {
  if (max <= 5) return 1;
  const bruto = max / 4;
  const mag = 10 ** Math.floor(Math.log10(bruto));
  return [1, 2, 2.5, 5, 10].map((m) => m * mag).find((p) => p >= bruto) ?? bruto;
}

// Columnas por día (o por semana). Se rotulan solo el máximo y el último
// periodo; el resto vive en el tooltip.
export function Columnas({ serie, porSemana, alto = 210 }: { serie: { fecha: string; visitas: number }[]; porSemana: boolean; alto?: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(...serie.map((s) => s.visitas), 0);
  const paso = pasoLimpio(Math.max(max, 1));
  const tope = Math.max(paso, Math.ceil(max / paso) * paso);
  const ticks = Array.from({ length: Math.round(tope / paso) + 1 }, (_, i) => i * paso);
  const idxMax = serie.findIndex((s) => s.visitas === max && max > 0);
  const alturaPlot = alto - 26;
  const cadaCuanto = Math.ceil(serie.length / 12);

  if (!serie.length) return null;
  return (
    <div style={{ display: 'flex', gap: 8, height: alto }}>
      <div style={{ position: 'relative', width: 30, height: alturaPlot, flex: 'none' }}>
        {ticks.map((t) => (
          <span key={t} style={{ position: 'absolute', right: 0, bottom: `${(t / tope) * 100}%`, transform: 'translateY(50%)', fontSize: 11, color: '#8a978f', fontVariantNumeric: 'tabular-nums' }}>{compacto(t)}</span>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: alturaPlot }}>
          {ticks.map((t) => (
            <div key={t} style={{ position: 'absolute', left: 0, right: 0, bottom: `${(t / tope) * 100}%`, borderTop: `1px solid ${t === 0 ? '#cfd8d2' : '#eef2ee'}` }} />
          ))}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: alturaPlot, display: 'flex', alignItems: 'flex-end' }}>
          {serie.map((s, i) => {
            const etiqueta = i === idxMax || i === serie.length - 1;
            return (
              <div
                key={s.fecha}
                onMouseEnter={() => setHover(i)}
                onMouseLeave={() => setHover(null)}
                style={{ flex: 1, height: '100%', position: 'relative', cursor: 'default' }}
              >
                <div style={{
                  position: 'absolute', bottom: 0, left: '50%', transform: 'translateX(-50%)',
                  width: '62%', maxWidth: 24, minWidth: 3, height: `${(s.visitas / tope) * 100}%`, minHeight: s.visitas ? 2 : 0,
                  background: hover === i ? '#0d3d24' : i === serie.length - 1 ? VERDE : VERDE_SUAVE, borderRadius: '4px 4px 0 0',
                }} />
                {etiqueta && s.visitas > 0 && hover !== i && (
                  <span style={{ position: 'absolute', left: 0, right: 0, textAlign: 'center', bottom: `calc(${(s.visitas / tope) * 100}% + 3px)`, fontSize: 11.5, fontWeight: 600, color: '#3a4a41', fontVariantNumeric: 'tabular-nums' }}>{s.visitas}</span>
                )}
                {hover === i && (
                  <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: `calc(${(s.visitas / tope) * 100}% + 6px)`, background: '#1f2a24', color: '#fff', borderRadius: 8, padding: '7px 10px', whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none', boxShadow: '0 4px 12px rgba(0,0,0,.2)' }}>
                    <div style={{ fontSize: 14, fontWeight: 700 }}>{s.visitas} visitas</div>
                    <div style={{ fontSize: 11.5, color: '#c5d6cb' }}>{porSemana ? `Semana del ${etiquetaDia(s.fecha, false)}` : etiquetaDia(s.fecha, false)}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 20, display: 'flex' }}>
          {serie.map((s, i) => (
            <span key={s.fecha} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#8a978f', whiteSpace: 'nowrap', overflow: 'visible' }}>
              {i % cadaCuanto === 0 ? etiquetaEje(s.fecha, porSemana) : ''}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// Barras horizontales por categoría (todas del mismo tono: lo que distingue
// a cada una es su etiqueta, no su color), con el valor en la punta.
export function BarrasHorizontales({ items }: { items: { etiqueta: string; valor: number }[] }) {
  const max = Math.max(1, ...items.map((i) => i.valor));
  const total = items.reduce((s, i) => s + i.valor, 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {items.map((it) => (
        <div key={it.etiqueta} title={`${it.etiqueta}: ${it.valor} (${total ? Math.round((it.valor / total) * 100) : 0}%)`}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12.5, color: '#3a4a41', marginBottom: 5 }}>
            <span>{it.etiqueta}</span>
            <span style={{ fontVariantNumeric: 'tabular-nums', color: '#5a665f' }}>
              <b style={{ color: '#263238' }}>{it.valor}</b> · {total ? Math.round((it.valor / total) * 100) : 0}%
            </span>
          </div>
          <div style={{ height: 10, background: '#f1f4f2', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${(it.valor / max) * 100}%`, minWidth: it.valor ? 3 : 0, background: VERDE, borderRadius: '0 4px 4px 0' }} />
          </div>
        </div>
      ))}
    </div>
  );
}

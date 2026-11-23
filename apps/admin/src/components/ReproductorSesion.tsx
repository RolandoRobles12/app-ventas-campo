import { useEffect, useRef, useState } from 'react';
import { api, type GrabacionDetalle } from '../api';
import { useToast } from '../toast';
import { Avatar, boton } from './ui';

// Reproduce una sesión grabada de la app del vendedor (rrweb). Baja los
// fragmentos uno por uno, los junta y los pasa al reproductor. A la derecha,
// los momentos importantes (pantallas, frustración, errores, visitas) para
// saltar directo a ellos.

type Player = InstanceType<typeof import('rrweb-player').default>;
type EventosPlayer = ConstructorParameters<typeof import('rrweb-player').default>[0]['props']['events'];
interface EventoRr { type: number; timestamp: number; data?: { tag?: string; payload?: Record<string, unknown>; width?: number; height?: number } }

// Colores de cada tipo de momento en la línea de tiempo del reproductor.
const TAGS: Record<string, string> = {
  'Frustración': '#c0392b',
  'Error': '#7a2a20',
  'No pudo guardar': '#e07a26',
  'Visita guardada': '#157347',
  'Pantalla': '#9aa39c',
  'Sin señal': '#5a665f',
  'Con señal': '#5a665f',
};
const TIPO_FULL_SNAPSHOT = 2;
const TIPO_META = 4;
const TIPO_CUSTOM = 5;

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(s % 60).padStart(2, '0')}`;
};

function describir(tag: string, p: Record<string, unknown> = {}): string {
  switch (tag) {
    case 'Pantalla': return `Abrió ${p.nombre ?? 'una pantalla'}`;
    case 'Frustración': return `Toques repetidos en "${p.en ?? '—'}"`;
    case 'Error': return String(p.mensaje ?? 'Error');
    case 'Visita guardada': return `Guardó la visita${p.resultado ? ` · ${p.resultado}` : ''}${p.sinSenal ? ' (sin señal)' : ''}`;
    case 'No pudo guardar': return `No pudo guardar${p.motivo ? `: ${p.motivo}` : ''}${p.metros ? ` (a ${p.metros} m)` : ''}`;
    default: return tag;
  }
}

export function ReproductorSesion({ sesionId, onClose }: { sesionId: string; onClose: () => void }) {
  const { showToast } = useToast();
  const contenedor = useRef<HTMLDivElement>(null);
  const player = useRef<Player | null>(null);
  const [detalle, setDetalle] = useState<GrabacionDetalle | null>(null);
  const [progreso, setProgreso] = useState<{ hechos: number; total: number } | null>(null);
  const [faltantes, setFaltantes] = useState(0);
  const [error, setError] = useState('');
  const [momentos, setMomentos] = useState<{ tag: string; texto: string; offset: number }[]>([]);
  const [listo, setListo] = useState(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const det = await api.grabacion(sesionId);
        if (cancelado) return;
        setDetalle(det);
        setProgreso({ hechos: 0, total: det.lista.length });
        const eventos: EventoRr[] = [];
        let perdidos = 0;
        let primerError = '';
        for (let i = 0; i < det.lista.length; i++) {
          try {
            eventos.push(...((await api.fragmentoGrabacion(sesionId, det.lista[i].seq)) as EventoRr[]));
          } catch (e) {
            perdidos++;
            if (!primerError) primerError = (e as Error).message;
          }
          if (cancelado) return;
          setProgreso({ hechos: i + 1, total: det.lista.length });
        }
        setFaltantes(perdidos);
        eventos.sort((a, b) => a.timestamp - b.timestamp);
        const inicio = eventos.findIndex((e) => e.type === TIPO_FULL_SNAPSHOT);
        if (perdidos && perdidos === det.lista.length) {
          setError(`No se pudo bajar ningún pedazo de esta grabación. ${primerError}`);
          return;
        }
        if (inicio < 0 || eventos.length < 2) {
          setError('Los pedazos que sí se bajaron no traen la pantalla completa, así que no se pueden reproducir.');
          return;
        }
        // El reproductor necesita empezar con la descripción de la pantalla
        // (meta) y su "foto" completa.
        const meta = eventos.slice(0, inicio + 1).reverse().find((e) => e.type === TIPO_META);
        const desde = meta ? eventos.indexOf(meta) : inicio;
        const validos = eventos.slice(desde);
        const t0 = validos[0].timestamp;
        setMomentos(validos
          .filter((e) => e.type === TIPO_CUSTOM && e.data?.tag)
          .map((e) => ({ tag: e.data!.tag!, texto: describir(e.data!.tag!, e.data!.payload), offset: e.timestamp - t0 })));

        const [{ default: Player }] = await Promise.all([import('rrweb-player'), import('rrweb-player/dist/style.css')]);
        if (cancelado || !contenedor.current) return;
        const w = meta?.data?.width || 412;
        const h = meta?.data?.height || 860;
        const alto = Math.max(360, Math.min(window.innerHeight - 220, 760));
        const ancho = Math.round(Math.min(alto * (w / h), (contenedor.current.parentElement?.clientWidth ?? 600) - 20));
        contenedor.current.innerHTML = '';
        player.current = new Player({
          target: contenedor.current,
          props: {
            events: validos as unknown as EventosPlayer,
            width: Math.max(ancho, 260), height: alto, autoPlay: true, skipInactive: true, showController: true,
            speedOption: [1, 2, 4, 8], tags: TAGS, mouseTail: false,
          },
        });
        setListo(true);
      } catch (e) {
        if (!cancelado) setError((e as Error).message || 'No se pudo cargar la grabación.');
      }
    })();
    return () => {
      cancelado = true;
      // Componente de Svelte: $destroy existe en tiempo de ejecución aunque
      // sus tipos no lo declaren.
      try { (player.current as unknown as { $destroy?: () => void } | null)?.$destroy?.(); } catch { /* ya no estaba */ }
      player.current = null;
    };
  }, [sesionId]);

  const ir = (offset: number) => { try { player.current?.goto(Math.max(0, offset - 1500), true); } catch { /* aún cargando */ } };

  const borrar = async () => {
    if (!confirm('¿Borrar esta grabación? No se puede deshacer.')) return;
    try {
      await api.borrarGrabacion(sesionId);
      showToast('Grabación borrada');
      onClose();
    } catch (e) {
      showToast((e as Error).message || 'No se pudo borrar', 'error');
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(20,40,30,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 1120, maxWidth: 'calc(100vw - 32px)', height: 'calc(100vh - 40px)', background: '#fff', borderRadius: 14, boxShadow: '0 24px 60px rgba(0,0,0,.3)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 20px', borderBottom: '1px solid #eef2ee', display: 'flex', alignItems: 'center', gap: 12 }}>
          {detalle && <Avatar color={detalle.color} iniciales={detalle.iniciales} size={34} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 16, fontWeight: 600, color: '#263238' }}>{detalle ? `Sesión de ${detalle.vendedorNombre}` : 'Cargando sesión…'}</div>
            {detalle && (
              <div style={{ fontSize: 12.5, color: '#8a978f', marginTop: 2 }}>
                {new Date(detalle.inicio).toLocaleString('es-MX', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                {' · '}{mmss(detalle.duracionSeg * 1000)}{detalle.dispositivo ? ` · ${detalle.dispositivo}` : ''}
                {' · '}{detalle.toques} toques{detalle.rabia ? ` · ${detalle.rabia} de frustración` : ''}{detalle.errores ? ` · ${detalle.errores} errores` : ''}
              </div>
            )}
          </div>
          <button onClick={borrar} style={boton.peligro}>Borrar grabación</button>
          <button onClick={onClose} style={boton.secundario}>Cerrar</button>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex' }}>
          <div style={{ flex: 1, minWidth: 0, background: '#eef3ee', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 10, position: 'relative' }}>
            {!listo && !error && (
              <div style={{ position: 'absolute', textAlign: 'center', color: '#5a665f', fontSize: 13 }}>
                Bajando la grabación{progreso && progreso.total ? `… ${progreso.hechos} de ${progreso.total}` : '…'}
                {progreso && progreso.total > 0 && (
                  <div style={{ width: 220, height: 6, background: '#dfe7e1', borderRadius: 3, marginTop: 10, overflow: 'hidden' }}>
                    <div style={{ width: `${(progreso.hechos / progreso.total) * 100}%`, height: '100%', background: '#157347' }} />
                  </div>
                )}
              </div>
            )}
            {error && <div style={{ maxWidth: 380, textAlign: 'center', color: '#a8322a', fontSize: 13.5, lineHeight: 1.5 }}>{error}</div>}
            <div ref={contenedor} />
          </div>
          <aside style={{ width: 300, flex: 'none', borderLeft: '1px solid #eef2ee', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <div style={{ padding: '14px 16px 8px', fontSize: 13, fontWeight: 600, color: '#263238' }}>Momentos <span style={{ fontWeight: 400, color: '#8a978f' }}>· toca uno para ir ahí</span></div>
            {faltantes > 0 && !error && <div style={{ margin: '0 16px 8px', fontSize: 12, color: '#94500f' }}>{faltantes === 1 ? 'No se pudo bajar 1 pedazo' : `No se pudieron bajar ${faltantes} pedazos`} de la grabación: puede haber saltos.</div>}
            <div className="adm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '0 8px 12px' }}>
              {momentos.length === 0 && listo && <div style={{ padding: '6px 8px', fontSize: 12.5, color: '#9aa39c' }}>Sin momentos marcados.</div>}
              {momentos.map((m, i) => (
                <button
                  key={i} onClick={() => ir(m.offset)}
                  style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'flex-start', textAlign: 'left', background: 'none', border: 'none', borderRadius: 8, padding: '7px 8px', cursor: 'pointer' }}
                  className="rowh"
                >
                  <span style={{ flex: 'none', width: 8, height: 8, borderRadius: '50%', background: TAGS[m.tag] ?? '#9aa39c', marginTop: 5 }} />
                  <span style={{ flex: 'none', fontSize: 12, color: '#8a978f', fontVariantNumeric: 'tabular-nums', minWidth: 38 }}>{mmss(m.offset)}</span>
                  <span style={{ fontSize: 12.5, color: m.tag === 'Pantalla' ? '#5a665f' : '#263238', fontWeight: m.tag === 'Pantalla' ? 400 : 600, lineHeight: 1.4, wordBreak: 'break-word' }}>{m.texto}</span>
                </button>
              ))}
            </div>
            <div style={{ padding: '10px 16px', borderTop: '1px solid #eef2ee', fontSize: 11.5, color: '#8a978f', lineHeight: 1.5 }}>
              Lo escrito se ve como ****; fotos, cámara y mapas, como recuadros vacíos.
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

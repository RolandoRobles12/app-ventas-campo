import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { api, type Grabacion, type UsoResumen, type UsoVendedor } from '../api';
import { useFilters } from '../filters';
import { haceCuanto, toISODate, etiquetaDia } from '../lib/dateRanges';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { Columnas, BarrasHorizontales } from '../components/Graficas';
import { Aviso, Avatar, Ayuda, Card, StatTile, boton } from '../components/ui';
import { useToast } from '../toast';
import { ReproductorSesion } from '../components/ReproductorSesion';

// "Uso de la app": cómo usan los vendedores la app del celular, medido
// dentro de la propia herramienta (como Microsoft Clarity). Dos partes:
//   - Resumen: eventos ligeros que se miden siempre (pantallas, tiempo,
//     toques, errores, señal y los pasos de registrar una visita o llamada).
//   - Grabaciones: algunas sesiones grabadas que se pueden reproducir.

const VERDE = '#157347';
const ROJO = '#c0392b';

const AYUDA_FRUSTRACION = 'Tres o más toques seguidos (en menos de un segundo) en el mismo lugar. Suele pasar cuando algo no responde o tarda, o cuando el vendedor cree que algo es un botón y no lo es.';
const AYUDA_MUERTOS = 'Toques en algo que no es un botón ni un campo (un texto, un ícono, un espacio vacío). Muchos en el mismo lugar indican que ahí el vendedor espera que pase algo.';
const AYUDA_TIEMPO = 'Tiempo con la app abierta y en pantalla. Cada rato en una misma pantalla se cuenta hasta 10 minutos, para no inflar el número cuando la tablet se queda prendida sin usar.';
const AYUDA_EMBUDO = 'Cada vez que el vendedor abre el registro (o la hoja de una llamada) es un intento. Las barras dicen cuántos intentos llegaron a cada paso; la caída entre pasos dice dónde se atoran o se salen. Las prácticas no cuentan.';
const AYUDA_MAPA = 'Dónde tocan los vendedores en esta pantalla, relativo al tamaño de su pantalla (arriba es arriba). Más oscuro es más toques; los cuadros con borde rojo tuvieron toques de frustración.';

const fmtMin = (min: number) => {
  if (min < 60) return `${Math.round(min)} min`;
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return m ? `${h} h ${m} min` : `${h} h`;
};
const fmtSeg = (seg: number) => (seg < 60 ? `${seg} s` : fmtMin(seg / 60));
const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : 0);
const fmtBytes = (b: number) => (b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`);
const hoy = () => toISODate(new Date());

const th: CSSProperties = { textAlign: 'left', padding: '10px 14px', fontSize: 12, fontWeight: 600, color: '#5a665f', borderBottom: '1px solid #eef2ee', whiteSpace: 'nowrap' };
const td: CSSProperties = { padding: '10px 14px', fontSize: 12.5, borderBottom: '1px solid #f2f5f2', verticalAlign: 'middle' };
const num: CSSProperties = { ...td, textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

function Pestanas({ valor, onCambio }: { valor: 'resumen' | 'grabaciones'; onCambio: (v: 'resumen' | 'grabaciones') => void }) {
  const op = (v: 'resumen' | 'grabaciones', etiqueta: string) => (
    <button
      role="tab" aria-selected={valor === v} onClick={() => onCambio(v)}
      style={{ border: 'none', background: valor === v ? '#fff' : 'transparent', color: valor === v ? '#0f5132' : '#5a665f', fontWeight: 600, fontSize: 13.5, padding: '8px 16px', borderRadius: 8, boxShadow: valor === v ? '0 1px 3px rgba(0,0,0,.1)' : 'none' }}
    >{etiqueta}</button>
  );
  return (
    <div role="tablist" style={{ display: 'inline-flex', gap: 4, background: '#e2eae4', borderRadius: 10, padding: 4, marginBottom: 16 }}>
      {op('resumen', 'Resumen de uso')}
      {op('grabaciones', 'Grabaciones de sesiones')}
    </div>
  );
}

export function Uso() {
  const [pestana, setPestana] = useState<'resumen' | 'grabaciones'>('resumen');
  const [sesionAbierta, setSesionAbierta] = useState<string | null>(null);

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="2.5" /><path d="M9.5 11.5l1.8 1.8 3.4-3.6" /><line x1="11" y1="18.5" x2="13" y2="18.5" /></svg>}
        title="Uso de la app"
        subtitle="Cómo usan los vendedores la app: qué pantallas, qué tocan, dónde se atoran y sesiones grabadas"
      />
      <FilterBar />
      <Pestanas valor={pestana} onCambio={setPestana} />
      {pestana === 'resumen' ? <Resumen onVerGrabaciones={() => setPestana('grabaciones')} /> : <Grabaciones onVer={setSesionAbierta} />}
      {sesionAbierta && <ReproductorSesion sesionId={sesionAbierta} onClose={() => setSesionAbierta(null)} />}
    </div>
  );
}

// ——— Resumen ———

function Resumen({ onVerGrabaciones }: { onVerGrabaciones: () => void }) {
  const { fProductos, fVendedores, fRango, fDesde, fHasta } = useFilters();
  const [datos, setDatos] = useState<UsoResumen | null>(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (fRango === 'personalizado' && (!fDesde || !fHasta)) return;
    setCargando(true);
    setError('');
    api.usoResumen({ vendedorIds: fVendedores.length ? fVendedores : undefined, productoIds: fVendedores.length ? undefined : fProductos, desde: fDesde, hasta: fHasta })
      .then(setDatos)
      .catch((e) => { setDatos(null); setError(e.message || 'No se pudo cargar el uso de la app.'); })
      .finally(() => setCargando(false));
  }, [fProductos, fVendedores, fRango, fDesde, fHasta]);

  if (error) return <Aviso tono="error">{error}</Aviso>;
  if (!datos) return <div style={{ padding: 40, textAlign: 'center', color: '#8a978f', fontSize: 13 }}>{cargando ? 'Cargando…' : ''}</div>;

  const t = datos.totales;
  if (!t.sesiones) {
    return (
      <Card>
        <div style={{ padding: '24px 8px', textAlign: 'center', color: '#5a665f', fontSize: 13.5, lineHeight: 1.6 }}>
          <div style={{ fontSize: 16, fontWeight: 600, color: '#263238', marginBottom: 6 }}>Todavía no hay datos de uso en este periodo</div>
          La medición empieza en cuanto los vendedores abren la versión nueva de la app. Los datos llegan cada minuto (o cuando recuperan señal).
        </div>
      </Card>
    );
  }
  const diasConUso = datos.porDia.length || 1;

  return (
    <div style={{ opacity: cargando ? 0.6 : 1, transition: 'opacity .15s' }}>
      {datos.truncado && <div style={{ marginBottom: 16 }}><Aviso tono="alerta">Hay muchísima actividad en este periodo: el resumen usa solo la más reciente. Acorta el rango de fechas para verla completa.</Aviso></div>}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 14, marginBottom: 16 }}>
        <StatTile label="Tiempo en la app" value={fmtMin(t.minutos)} sub={t.vendedores ? `${fmtMin(Math.round(t.minutos / t.vendedores / diasConUso))} por vendedor al día` : undefined} ayuda={AYUDA_TIEMPO} />
        <StatTile label="Sesiones" value={t.sesiones.toLocaleString('es-MX')} sub={`de ${t.vendedores} ${t.vendedores === 1 ? 'vendedor' : 'vendedores'}`} />
        <StatTile
          label="Toques de frustración" value={t.rabia.toLocaleString('es-MX')}
          sub={`${pct(t.rabia, t.toques)}% de ${t.toques.toLocaleString('es-MX')} toques`} tono={pct(t.rabia, t.toques) >= 2 ? 'mal' : 'neutro'} ayuda={AYUDA_FRUSTRACION}
        />
        <StatTile label="Errores de la app" value={t.errores.toLocaleString('es-MX')} sub={`${datos.errores.length} ${datos.errores.length === 1 ? 'distinto' : 'distintos'}`} tono={t.errores ? 'mal' : 'bien'} />
        <StatTile
          label="Se quedaron sin señal" value={`${t.cortesSenal} ${t.cortesSenal === 1 ? 'vez' : 'veces'}`}
          sub={t.minutosSinSenal ? `${fmtMin(t.minutosSinSenal)} en total` : undefined}
          ayuda="Veces que el teléfono perdió internet con la app abierta. Las visitas y llamadas se guardan y se envían al volver la señal."
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 16, marginBottom: 16, alignItems: 'start' }}>
        {datos.embudos.map((e) => <Embudo key={e.clave} titulo={e.titulo} pasos={e.pasos} />)}
        <Card titulo="Por qué no se pudo guardar una visita" subtitulo={'Cada vez que tocó "Guardar visita" y la app no la guardó'}>
          {datos.bloqueos.length ? <BarrasHorizontales items={datos.bloqueos.map((b) => ({ etiqueta: b.etiqueta, valor: b.veces }))} />
            : <div style={{ color: '#9aa39c', fontSize: 12.5 }}>Ninguna vez en este periodo.</div>}
        </Card>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 16, marginBottom: 16, alignItems: 'start' }}>
        <Card titulo="Uso por día" subtitulo="Minutos con la app abierta, sumando a todos los vendedores">
          <Columnas serie={datos.porDia.map((d) => ({ fecha: d.dia, visitas: d.minutos }))} porSemana={false} unidad="minutos" alto={200} />
        </Card>
        <Card titulo="A qué hora la usan" subtitulo="Minutos con la app abierta por hora del día (hora del centro)">
          <PorHora valores={datos.porHora} />
        </Card>
      </div>

      <Card titulo="Pantallas" subtitulo="Dónde pasan el tiempo y dónde se frustran" padding="18px 0 6px" paddingEncabezado="0 20px" style={{ marginBottom: 16 }}>
        <TablaPantallas datos={datos} />
      </Card>

      <MapaToques datos={datos} />

      <Card
        titulo="Por vendedor" subtitulo="Quién usa más la app y quién se atora. Desde aquí puedes grabar todas las sesiones de alguien por unos días."
        padding="18px 0 6px" paddingEncabezado="0 20px" style={{ marginBottom: 16 }}
        accion={<button style={boton.suave} onClick={onVerGrabaciones}>Ver grabaciones</button>}
      >
        <TablaVendedores vendedores={datos.vendedores} />
      </Card>

      <Card titulo="Errores de la app" subtitulo="Fallas que vio el vendedor (o que pasaron sin que se diera cuenta). Pásalas al equipo de desarrollo." padding="18px 0 6px" paddingEncabezado="0 20px" style={{ marginBottom: 16 }}>
        {datos.errores.length === 0 ? <div style={{ padding: '4px 20px 14px', color: '#9aa39c', fontSize: 12.5 }}>Sin errores en este periodo.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Error</th><th style={th}>Dónde</th><th style={{ ...th, textAlign: 'right' }}>Veces</th><th style={{ ...th, textAlign: 'right' }}>Vendedores</th><th style={th}>Último</th></tr></thead>
              <tbody>
                {datos.errores.map((e) => (
                  <tr key={e.mensaje}>
                    <td style={{ ...td, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: 12, color: '#7a2a20', wordBreak: 'break-word' }}>{e.mensaje}</td>
                    <td style={{ ...td, color: '#3a4a41' }}>{e.pantalla ?? '—'}</td>
                    <td style={{ ...num, fontWeight: 600 }}>{e.veces}</td>
                    <td style={num}>{e.vendedores}</td>
                    <td style={{ ...td, color: '#8a978f', whiteSpace: 'nowrap' }}>{haceCuanto(e.ultima)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card titulo="Cómo abren la app" subtitulo="Sesiones por tipo de teléfono y si usan la app instalada o desde el navegador">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 24 }}>
          <BarrasHorizontales items={datos.dispositivos.slice(0, 6).map((d) => ({ etiqueta: d.nombre, valor: d.sesiones }))} />
          <BarrasHorizontales items={[
            { etiqueta: 'App instalada (ícono en el teléfono)', valor: t.inicios.instalada },
            { etiqueta: 'Desde el navegador', valor: t.inicios.navegador },
          ]} />
        </div>
      </Card>
    </div>
  );
}

function Embudo({ titulo, pasos }: { titulo: string; pasos: { etiqueta: string; intentos: number }[] }) {
  const base = pasos[0]?.intentos ?? 0;
  return (
    <Card titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{titulo} <Ayuda texto={AYUDA_EMBUDO} /></span>} subtitulo={base ? `${base} ${base === 1 ? 'intento' : 'intentos'} en el periodo` : 'Sin intentos en el periodo'}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
        {pasos.map((p, i) => {
          const anterior = i ? pasos[i - 1].intentos : p.intentos;
          const caida = i && anterior ? Math.round(((anterior - p.intentos) / anterior) * 100) : 0;
          return (
            <div key={p.etiqueta} title={`${p.etiqueta}: ${p.intentos} (${pct(p.intentos, base)}% de los intentos)`}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5, color: '#3a4a41', marginBottom: 5 }}>
                <span>{i + 1}. {p.etiqueta}</span>
                <span style={{ fontVariantNumeric: 'tabular-nums', color: '#5a665f', whiteSpace: 'nowrap' }}>
                  <b style={{ color: '#263238' }}>{p.intentos}</b> · {base ? `${Math.round(pct(p.intentos, base))}%` : '—'}
                  {caida > 0 && <span style={{ color: caida >= 25 ? ROJO : '#8a978f', marginLeft: 6 }}>(−{caida}%)</span>}
                </span>
              </div>
              <div style={{ height: 12, background: '#f1f4f2', borderRadius: 2 }}>
                <div style={{ height: '100%', width: `${base ? (p.intentos / base) * 100 : 0}%`, minWidth: p.intentos ? 3 : 0, background: VERDE, borderRadius: '0 4px 4px 0' }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

function PorHora({ valores }: { valores: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  // Solo el horario con uso (con un margen), para que las barras no se pierdan.
  const conUso = valores.map((v, h) => (v > 0 ? h : -1)).filter((h) => h >= 0);
  const desde = conUso.length ? Math.max(0, Math.min(...conUso) - 1) : 7;
  const hasta = conUso.length ? Math.min(23, Math.max(...conUso) + 1) : 20;
  const horas = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  const max = Math.max(1, ...valores);
  const alto = 170;
  const etiquetaHora = (h: number) => `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`;
  return (
    <div style={{ position: 'relative', height: alto + 22 }}>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 0, height: alto, borderBottom: '1px solid #cfd8d2', display: 'flex', alignItems: 'flex-end', gap: 2 }}>
        {horas.map((h) => (
          <div key={h} onMouseEnter={() => setHover(h)} onMouseLeave={() => setHover(null)} style={{ flex: 1, height: '100%', position: 'relative' }}>
            <div style={{ position: 'absolute', bottom: 0, left: '15%', right: '15%', height: `${(valores[h] / max) * 100}%`, minHeight: valores[h] ? 2 : 0, background: hover === h ? '#0d3d24' : '#7cc49c', borderRadius: '4px 4px 0 0' }} />
            {hover === h && (
              <div style={{ position: 'absolute', left: '50%', transform: 'translateX(-50%)', bottom: `calc(${(valores[h] / max) * 100}% + 6px)`, background: '#1f2a24', color: '#fff', borderRadius: 8, padding: '7px 10px', whiteSpace: 'nowrap', zIndex: 5, pointerEvents: 'none' }}>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{fmtMin(valores[h])}</div>
                <div style={{ fontSize: 11.5, color: '#c5d6cb' }}>de {etiquetaHora(h)} a {etiquetaHora((h + 1) % 24)}</div>
              </div>
            )}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 18, display: 'flex', gap: 2 }}>
        {horas.map((h, i) => (
          <span key={h} style={{ flex: 1, textAlign: 'center', fontSize: 11, color: '#8a978f' }}>{i % 2 === 0 ? etiquetaHora(h) : ''}</span>
        ))}
      </div>
    </div>
  );
}

function TablaPantallas({ datos }: { datos: UsoResumen }) {
  const totalMin = datos.pantallas.reduce((s, p) => s + p.minutos, 0);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={th}>Pantalla</th>
            <th style={{ ...th, textAlign: 'right' }}>Veces que la abrieron</th>
            <th style={{ ...th, textAlign: 'right' }}>Tiempo</th>
            <th style={th}>% del tiempo</th>
            <th style={{ ...th, textAlign: 'right' }}>Promedio por vez</th>
            <th style={{ ...th, textAlign: 'right' }}>Toques</th>
            <th style={{ ...th, textAlign: 'right' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>Frustración <Ayuda texto={AYUDA_FRUSTRACION} /></span></th>
            <th style={{ ...th, textAlign: 'right' }}>Vendedores</th>
          </tr>
        </thead>
        <tbody>
          {datos.pantallas.map((p) => {
            const share = pct(p.minutos, totalMin);
            return (
              <tr key={p.pantalla} className="rowh">
                <td style={{ ...td, fontWeight: 600, color: '#263238' }}>{p.pantalla}</td>
                <td style={num}>{p.vistas.toLocaleString('es-MX')}</td>
                <td style={num}>{fmtMin(p.minutos)}</td>
                <td style={td}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ width: 90, height: 8, borderRadius: 2, background: '#f1f4f2', overflow: 'hidden' }}>
                      <span style={{ display: 'block', height: '100%', width: `${share}%`, background: VERDE, borderRadius: '0 4px 4px 0' }} />
                    </span>
                    <span style={{ fontVariantNumeric: 'tabular-nums', color: '#5a665f', minWidth: 38 }}>{Math.round(share)}%</span>
                  </span>
                </td>
                <td style={num}>{p.vistas ? fmtSeg(Math.round((p.minutos * 60) / p.vistas)) : '—'}</td>
                <td style={num}>{p.toques.toLocaleString('es-MX')}</td>
                <td style={{ ...num, color: p.rabia ? ROJO : '#9aa39c', fontWeight: p.rabia ? 600 : 400 }}>{p.rabia ? `${p.rabia} (${pct(p.rabia, p.toques)}%)` : '0'}</td>
                <td style={num}>{p.vendedores}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// Dónde tocan en cada pantalla: una rejilla sobre el contorno de un
// teléfono, de un solo tono (más oscuro = más toques).
function MapaToques({ datos }: { datos: UsoResumen }) {
  const opciones = useMemo(() => datos.mapaToques
    .map((m) => ({ pantalla: m.pantalla, total: m.celdas.reduce((s, c) => s + c.n, 0) }))
    .sort((a, b) => b.total - a.total), [datos]);
  const [elegida, setElegida] = useState<string | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; n: number; r: number } | null>(null);
  const pantalla = elegida && opciones.some((o) => o.pantalla === elegida) ? elegida : opciones[0]?.pantalla ?? null;
  const celdas = datos.mapaToques.find((m) => m.pantalla === pantalla)?.celdas ?? [];
  const max = Math.max(1, ...celdas.map((c) => c.n));
  const objetivos = datos.objetivos.filter((o) => o.pantalla === pantalla).slice(0, 12);
  const totalPantalla = opciones.find((o) => o.pantalla === pantalla)?.total ?? 0;
  const ANCHO = 230;
  const ALTO = Math.round(ANCHO * 2.05);
  const cw = ANCHO / datos.rejilla.x;
  const ch = ALTO / datos.rejilla.y;

  return (
    <Card
      titulo={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Mapa de toques <Ayuda texto={AYUDA_MAPA} /></span>}
      subtitulo="Dónde tocan en cada pantalla y qué es lo que más tocan"
      style={{ marginBottom: 16 }}
      accion={opciones.length > 0 && (
        <select className="fsel" value={pantalla ?? ''} onChange={(e) => setElegida(e.target.value)} aria-label="Pantalla">
          {opciones.map((o) => <option key={o.pantalla} value={o.pantalla}>{o.pantalla} · {o.total} toques</option>)}
        </select>
      )}
    >
      {!pantalla ? <div style={{ color: '#9aa39c', fontSize: 12.5 }}>Sin toques en este periodo.</div> : (
        <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap', alignItems: 'flex-start' }}>
          <div style={{ flex: 'none' }}>
            <div style={{ position: 'relative', width: ANCHO + 16, padding: 8, borderRadius: 26, background: '#263238' }}>
              <svg width={ANCHO} height={ALTO} style={{ display: 'block', borderRadius: 18, background: '#f6f9f7' }} onMouseLeave={() => setHover(null)} role="img" aria-label={`Mapa de toques de ${pantalla}`}>
                {celdas.map((c) => {
                  const f = c.n / max;
                  return (
                    <rect
                      key={`${c.x},${c.y}`}
                      x={c.x * ANCHO - cw / 2 + 1} y={c.y * ALTO - ch / 2 + 1} width={cw - 2} height={ch - 2} rx={2}
                      fill={VERDE} fillOpacity={0.12 + 0.88 * f}
                      stroke={c.r ? ROJO : 'none'} strokeWidth={c.r ? 1.5 : 0}
                      onMouseEnter={() => setHover(c)}
                    />
                  );
                })}
              </svg>
              {hover && (
                <div style={{ position: 'absolute', left: 8 + hover.x * ANCHO, top: 8 + hover.y * ALTO - 10, transform: 'translate(-50%, -100%)', background: '#1f2a24', color: '#fff', borderRadius: 8, padding: '6px 9px', whiteSpace: 'nowrap', pointerEvents: 'none', fontSize: 12.5, zIndex: 5 }}>
                  <b>{hover.n}</b> {hover.n === 1 ? 'toque' : 'toques'}{hover.r ? <span style={{ color: '#ffb4a8' }}> · {hover.r} de frustración</span> : null}
                </div>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 11.5, color: '#6f7d75' }}>
              <span>Menos</span>
              <span style={{ width: 80, height: 8, borderRadius: 2, background: `linear-gradient(90deg, rgba(21,115,71,.12), ${VERDE})` }} />
              <span>Más</span>
              <span style={{ width: 10, height: 10, border: `1.5px solid ${ROJO}`, borderRadius: 2, marginLeft: 10 }} />
              <span>Frustración</span>
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#263238', marginBottom: 8 }}>Lo más tocado en {pantalla} <span style={{ fontWeight: 400, color: '#8a978f' }}>· {totalPantalla} toques</span></div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...th, paddingLeft: 0 }}>Qué tocaron</th>
                  <th style={{ ...th, textAlign: 'right' }}>Toques</th>
                  <th style={{ ...th, textAlign: 'right' }}>Frustración</th>
                  <th style={{ ...th, textAlign: 'right' }}><span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>Sin respuesta <Ayuda texto={AYUDA_MUERTOS} /></span></th>
                </tr>
              </thead>
              <tbody>
                {objetivos.map((o) => (
                  <tr key={o.objetivo}>
                    <td style={{ ...td, paddingLeft: 0, color: '#263238' }}>{o.objetivo}</td>
                    <td style={num}>{o.toques}</td>
                    <td style={{ ...num, color: o.rabia ? ROJO : '#9aa39c' }}>{o.rabia}</td>
                    <td style={{ ...num, color: o.muertos ? '#94500f' : '#9aa39c' }}>{o.muertos}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Card>
  );
}

// Grabar a propósito todas las sesiones de un vendedor por unos días.
function ControlGrabar({ vendedorId, grabarHasta, onCambio }: { vendedorId: string; grabarHasta: string | null; onCambio: (hasta: string | null) => void }) {
  const { showToast } = useToast();
  const [guardando, setGuardando] = useState(false);
  const activo = !!grabarHasta && grabarHasta >= hoy();
  const cambiar = async (dias: number) => {
    setGuardando(true);
    try {
      const r = await api.grabarVendedor(vendedorId, dias);
      onCambio(r.grabarHasta);
      showToast(r.grabarHasta ? `Listo: se grabarán sus sesiones hasta el ${etiquetaDia(r.grabarHasta, false)}` : 'Listo: ya no se graban sus sesiones a propósito');
    } catch (e) {
      showToast((e as Error).message || 'No se pudo cambiar', 'error');
    } finally {
      setGuardando(false);
    }
  };
  return (
    <select
      className="fsel" disabled={guardando} value=""
      onChange={(e) => { if (e.target.value) cambiar(Number(e.target.value)); }}
      style={{ padding: '6px 28px 6px 10px', fontSize: 12.5, color: activo ? '#0f5132' : '#3a4a41', fontWeight: activo ? 600 : 400, border: `1px solid ${activo ? '#9fd0b4' : '#e0e8e2'}` }}
      aria-label="Grabar sus sesiones"
    >
      <option value="">{activo ? `● Grabando hasta ${etiquetaDia(grabarHasta!, true).toLowerCase()}` : 'Grabar sus sesiones…'}</option>
      <option value="1">Grabar hoy</option>
      <option value="3">Grabar 3 días</option>
      <option value="7">Grabar 7 días</option>
      {activo && <option value="0">Dejar de grabar</option>}
    </select>
  );
}

function TablaVendedores({ vendedores }: { vendedores: UsoVendedor[] }) {
  const [filas, setFilas] = useState(vendedores);
  useEffect(() => setFilas(vendedores), [vendedores]);
  const { reload } = useFilters();
  return (
    <div style={{ overflowX: 'auto', maxHeight: 520 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
          <tr>
            <th style={th}>Vendedor</th>
            <th style={{ ...th, textAlign: 'right' }}>Días con uso</th>
            <th style={{ ...th, textAlign: 'right' }}>Tiempo al día</th>
            <th style={{ ...th, textAlign: 'right' }}>Visitas guardadas / abiertas</th>
            <th style={{ ...th, textAlign: 'right' }}>Frustración</th>
            <th style={{ ...th, textAlign: 'right' }}>Errores</th>
            <th style={th}>Última actividad</th>
            <th style={th}>Grabación</th>
          </tr>
        </thead>
        <tbody>
          {filas.map((v) => (
            <tr key={v.id} className="rowh">
              <td style={td}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
                  <Avatar color={v.color} iniciales={v.iniciales} size={28} />
                  <span style={{ fontWeight: 600, color: '#263238' }}>{v.nombre}</span>
                </span>
              </td>
              <td style={num}>{v.dias}</td>
              <td style={num}>{fmtMin(v.minutosPorDia)}</td>
              <td style={num}>
                {v.visitasAbiertas ? <>{v.visitasGuardadas} / {v.visitasAbiertas} <span style={{ color: '#8a978f' }}>({Math.round(pct(v.visitasGuardadas, v.visitasAbiertas))}%)</span></> : '—'}
              </td>
              <td style={{ ...num, color: v.rabia ? ROJO : '#9aa39c', fontWeight: v.rabia ? 600 : 400 }}>{v.rabia}</td>
              <td style={{ ...num, color: v.errores ? ROJO : '#9aa39c' }}>{v.errores}</td>
              <td style={{ ...td, color: '#8a978f', whiteSpace: 'nowrap' }}>{haceCuanto(v.ultima)}</td>
              <td style={td}>
                <ControlGrabar
                  vendedorId={v.id} grabarHasta={v.grabarHasta}
                  onCambio={(hasta) => { setFilas((fs) => fs.map((f) => (f.id === v.id ? { ...f, grabarHasta: hasta } : f))); reload(); }}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ——— Grabaciones ———

const PORCENTAJES = [0, 5, 10, 25, 50, 100];

function Grabaciones({ onVer }: { onVer: (id: string) => void }) {
  const { fProductos, fVendedores, fRango, fDesde, fHasta, vendedores } = useFilters();
  const { showToast } = useToast();
  const [items, setItems] = useState<Grabacion[]>([]);
  const [truncado, setTruncado] = useState(false);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');
  const [soloProblemas, setSoloProblemas] = useState(false);
  const [porcentaje, setPorcentaje] = useState<number | null>(null);

  useEffect(() => { api.config().then((c) => setPorcentaje(c.grabacionPorcentaje)).catch(() => {}); }, []);

  useEffect(() => {
    if (fRango === 'personalizado' && (!fDesde || !fHasta)) return;
    setCargando(true);
    setError('');
    api.grabaciones({ vendedorIds: fVendedores.length ? fVendedores : undefined, productoIds: fVendedores.length ? undefined : fProductos, desde: fDesde, hasta: fHasta })
      .then((r) => { setItems(r.items); setTruncado(r.truncado); })
      .catch((e) => { setItems([]); setError(e.message || 'No se pudieron cargar las grabaciones.'); })
      .finally(() => setCargando(false));
  }, [fProductos, fVendedores, fRango, fDesde, fHasta]);

  const guardarPorcentaje = async (n: number) => {
    const antes = porcentaje;
    setPorcentaje(n);
    try {
      const c = await api.guardarConfig({ grabacionPorcentaje: n });
      setPorcentaje(c.grabacionPorcentaje);
      showToast(n ? `Listo: se grabará ${n === 100 ? 'cada sesión' : `1 de cada ${Math.round(100 / n)} sesiones`} (desde la próxima vez que abran la app)` : 'Listo: solo se graban los vendedores que elijas');
    } catch (e) {
      setPorcentaje(antes);
      showToast((e as Error).message || 'No se pudo guardar', 'error');
    }
  };

  const grabandoAProposito = vendedores.filter((v) => v.grabarHasta && v.grabarHasta >= hoy());
  const visibles = soloProblemas ? items.filter((g) => g.rabia || g.errores) : items;

  return (
    <div>
      <Card titulo="Qué se graba" subtitulo="Se reproduce como un video, pero no lo es: se guarda la pantalla de la app y cada toque" style={{ marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#263238', marginBottom: 8 }}>Sesiones al azar</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PORCENTAJES.map((n) => (
                <button
                  key={n} onClick={() => guardarPorcentaje(n)} aria-pressed={porcentaje === n} disabled={porcentaje == null}
                  style={{ ...boton.secundario, padding: '7px 12px', fontSize: 12.5, ...(porcentaje === n ? { background: '#157347', color: '#fff', border: '1px solid #157347' } : {}) }}
                >{n === 0 ? 'Ninguna' : `${n}%`}</button>
              ))}
            </div>
            <p style={{ margin: '10px 0 0', fontSize: 12.5, color: '#6f7d75', lineHeight: 1.5 }}>
              Además, se graban todas las sesiones de los vendedores que elijas en <b>Resumen de uso → Por vendedor</b>.
              {grabandoAProposito.length > 0 && <> Ahora: {grabandoAProposito.map((v) => v.nombre).join(', ')}.</>}
            </p>
          </div>
          <div style={{ fontSize: 12.5, color: '#3a4a41', lineHeight: 1.6 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: '#263238', marginBottom: 6 }}>Privacidad</div>
            Lo que el vendedor escribe se ve como <code>****</code>; las fotos, la cámara y los mapas se ven como recuadros vacíos; los teléfonos de los negocios van tapados.
            Los vendedores saben que la app mide su uso (se les avisa en la bienvenida y en novedades). Las grabaciones se borran solas a los 30 días.
            Solo se suben con internet y nunca en modo de ahorro de datos.
          </div>
        </div>
      </Card>

      {error && <div style={{ marginBottom: 16 }}><Aviso tono="error">{error}</Aviso></div>}
      {truncado && <div style={{ marginBottom: 16 }}><Aviso tono="alerta">Se muestran las 300 sesiones más recientes. Acorta el rango de fechas para ver las demás.</Aviso></div>}

      <Card
        titulo="Sesiones grabadas" subtitulo="La más reciente primero. Una sesión va de que el vendedor abre la app hasta que la deja por más de 30 minutos."
        padding="18px 0 0" paddingEncabezado="0 20px"
        accion={(
          <label style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#3a4a41', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            <input type="checkbox" checked={soloProblemas} onChange={(e) => setSoloProblemas(e.target.checked)} />
            Solo con frustración o errores
          </label>
        )}
      >
        {cargando ? <div style={{ padding: 30, textAlign: 'center', color: '#8a978f', fontSize: 13 }}>Cargando grabaciones…</div>
          : visibles.length === 0 ? (
            <div style={{ padding: 30, textAlign: 'center', color: '#9aa39c', fontSize: 12.5 }}>
              {items.length ? 'Ninguna sesión de este periodo tuvo frustración ni errores.' : 'No hay sesiones grabadas en este periodo.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={th}>Cuándo</th><th style={th}>Vendedor</th><th style={{ ...th, textAlign: 'right' }}>Duración</th>
                    <th style={th}>Pantallas</th><th style={{ ...th, textAlign: 'right' }}>Toques</th>
                    <th style={{ ...th, textAlign: 'right' }}>Frustración</th><th style={{ ...th, textAlign: 'right' }}>Errores</th>
                    <th style={th}>Por qué se grabó</th><th style={th} />
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((g) => (
                    <tr key={g.id} className="rowh">
                      <td style={{ ...td, whiteSpace: 'nowrap', color: '#3a4a41' }}>
                        {new Date(g.inicio).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        {g.dispositivo && <div style={{ fontSize: 11, color: '#8a978f', marginTop: 1 }}>{g.dispositivo}</div>}
                      </td>
                      <td style={td}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 9 }}>
                          <Avatar color={g.color} iniciales={g.iniciales} size={26} />
                          <span style={{ fontWeight: 600, color: '#263238' }}>{g.vendedorNombre}</span>
                        </span>
                      </td>
                      <td style={num}>{fmtSeg(g.duracionSeg)}</td>
                      <td style={{ ...td, color: '#5a665f', maxWidth: 280 }}>{g.pantallas.slice(0, 4).join(' · ')}{g.pantallas.length > 4 ? ` +${g.pantallas.length - 4}` : ''}</td>
                      <td style={num}>{g.toques}</td>
                      <td style={{ ...num, color: g.rabia ? ROJO : '#9aa39c', fontWeight: g.rabia ? 600 : 400 }}>{g.rabia}</td>
                      <td style={{ ...num, color: g.errores ? ROJO : '#9aa39c' }}>{g.errores}</td>
                      <td style={td}><Etiqueta>{g.motivo === 'pedida' ? 'Elegido' : 'Al azar'}</Etiqueta></td>
                      <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span style={{ fontSize: 11, color: '#9aa39c', marginRight: 10 }}>{fmtBytes(g.bytes)}</span>
                        <button style={{ ...boton.primario, padding: '7px 14px', fontSize: 12.5 }} onClick={() => onVer(g.id)}>▶ Ver</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
      </Card>
    </div>
  );
}

function Etiqueta({ children }: { children: ReactNode }) {
  return <span style={{ display: 'inline-block', fontSize: 11.5, fontWeight: 600, color: '#3a4a41', background: '#eef2ef', padding: '3px 9px', borderRadius: 10, whiteSpace: 'nowrap' }}>{children}</span>;
}


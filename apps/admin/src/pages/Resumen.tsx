import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type EstadoRuta, type MetricasResumen } from '../api';
import { useFilters } from '../filters';
import { RANGO_LABELS, etiquetaDia, haceCuanto, sumarDias, toISODate } from '../lib/dateRanges';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { Avatar, Card, Medidor, StatTile, ThOrden } from '../components/ui';
import { BarrasHorizontales, Columnas } from '../components/Graficas';
import { prodBadgeStyle } from '../badges';

const ETIQUETA_RESULTADO: Record<string, string> = {
  'Se realizó solicitud': 'Hizo solicitud',
  'Se dejó información': 'Se dejó información',
  'Se reagenda visita': 'Volver otro día',
  'Cliente no interesado': 'No le interesa',
  'No es un negocio válido o existente': 'Cerrado o no existe',
};

type Col = 'nombre' | 'visitas' | 'diasActivos' | 'promedioDia' | 'cumplimiento' | 'ubicacionValida' | 'ultimaVisita';

export function Resumen() {
  const { fProductos, fVendedores, fRango, fDesde, fHasta, vendedores } = useFilters();
  const [data, setData] = useState<MetricasResumen | null>(null);
  const [rutas, setRutas] = useState<EstadoRuta[]>([]);
  const [cargando, setCargando] = useState(false);
  const [orden, setOrden] = useState<{ k: Col; desc: boolean }>({ k: 'visitas', desc: true });

  useEffect(() => {
    setCargando(true);
    // "Todo" no tiene sentido para métricas de periodo: se toman los últimos
    // 90 días (el máximo que acepta el servidor).
    const hoy = toISODate(new Date());
    const desde = fRango === 'todo' ? sumarDias(hoy, -89) : fDesde;
    const hasta = fRango === 'todo' ? hoy : fHasta;
    api.metricas({ productoIds: fProductos, vendedorIds: fVendedores, desde, hasta })
      .then(setData).catch(() => {}).finally(() => setCargando(false));
    api.rutasEstado({ productoIds: fProductos, vendedorIds: fVendedores }).then((r) => setRutas(r.items)).catch(() => {});
  }, [fProductos, fVendedores, fRango, fDesde, fHasta]);

  const t = data?.totales;
  const filas = useMemo(() => {
    const lista = [...(data?.vendedores ?? [])];
    const val = (f: (typeof lista)[number]) => {
      const v = f[orden.k];
      return v == null ? -1 : typeof v === 'string' ? v : v;
    };
    lista.sort((a, b) => {
      const va = val(a), vb = val(b);
      const c = typeof va === 'string' && typeof vb === 'string' ? va.localeCompare(vb) : Number(va) - Number(vb);
      return orden.desc ? -c : c;
    });
    return lista;
  }, [data, orden]);

  const alertas = useMemo(() => {
    const activos = new Map(vendedores.filter((v) => v.estado !== 'Baja').map((v) => [v.id, v]));
    const deRuta = rutas.filter((r) => activos.has(r.vendedorId));
    const nombre = (id: string) => activos.get(id)?.nombre ?? '';
    return {
      sinRuta: deRuta.filter((r) => r.pendientes === 0).map((r) => nombre(r.vendedorId)),
      porVencer: deRuta.filter((r) => r.pendientes > 0 && r.diasRestantes != null && r.diasRestantes <= 2).map((r) => nombre(r.vendedorId)),
      atrasadas: deRuta.filter((r) => r.atrasadas >= 5).sort((a, b) => b.atrasadas - a.atrasadas).map((r) => `${nombre(r.vendedorId)} (${r.atrasadas})`),
      sinVisitas: (data?.vendedores ?? []).filter((f) => f.estado !== 'Baja' && f.visitas === 0).map((f) => f.nombre),
      noVerificadas: (data?.vendedores ?? []).filter((f) => f.ubicacionValida != null && f.ubicacionValida < 50).map((f) => `${f.nombre} (${f.ubicacionValida}%)`),
    };
  }, [rutas, vendedores, data]);

  const periodo = fRango === 'todo' ? 'Últimos 90 días' : RANGO_LABELS[fRango];
  const hayAlertas = Object.values(alertas).some((a) => a.length);

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" /></svg>}
        title="Resumen"
        subtitle={data ? `${periodo} · ${etiquetaDia(data.desde, false)} al ${etiquetaDia(data.hasta, false)}` : 'Cómo va la operación de campo'}
      />
      <FilterBar />

      <div style={{ opacity: cargando && data ? 0.55 : 1, transition: 'opacity .15s' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 14 }}>
          <StatTile
            label="Visitas" value={t ? t.visitas.toLocaleString('es-MX') : '—'}
            sub={t?.cambioPct != null ? `${t.cambioPct >= 0 ? '▲' : '▼'} ${Math.abs(t.cambioPct)}% vs periodo anterior` : 'sin periodo anterior comparable'}
            tono={t?.cambioPct == null ? 'neutro' : t.cambioPct >= 0 ? 'bien' : 'mal'}
          />
          <StatTile
            label="Cumplimiento de ruta" value={t?.cumplimiento != null ? `${t.cumplimiento}%` : '—'}
            sub={t ? (t.planeados ? `${t.cumplidos.toLocaleString('es-MX')} de ${t.planeados.toLocaleString('es-MX')} paradas planeadas` : 'sin paradas planeadas en el periodo') : undefined}
            ayuda="Paradas planeadas para días ya cerrados del periodo que ya se visitaron (lo de hoy no cuenta hasta mañana)."
          />
          <StatTile
            label="Visitas por vendedor al día" value={t ? t.promedioDia.toLocaleString('es-MX') : '—'}
            sub="promedio en los días que trabajó"
          />
          <StatTile
            label="Visitas verificadas" value={t?.ubicacionValida != null ? `${t.ubicacionValida}%` : '—'}
            sub={t?.validables ? `GPS a ≤50 m del negocio · ${t.validables.toLocaleString('es-MX')} verificables` : 'sin visitas verificables'}
            tono={t?.ubicacionValida == null ? 'neutro' : t.ubicacionValida >= 80 ? 'bien' : 'mal'}
            ayuda="Solo aplica a negocios del DENUE, que tienen ubicación de referencia."
          />
          <StatTile
            label="Vendedores con visitas" value={t ? <>{t.vendedoresConVisitas}<span style={{ fontSize: 18, color: '#8a978f' }}> / {t.vendedoresActivos}</span></> : '—'}
            sub={t ? `${t.negociosNuevos} negocios nuevos registrados` : undefined}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(0, 1fr)', gap: 14, marginTop: 14 }}>
          <Card titulo={data?.porSemana ? 'Visitas por semana' : 'Visitas por día'} subtitulo="Pasa el cursor sobre una barra para ver el detalle">
            {data && <Columnas serie={data.serie} porSemana={data.porSemana} />}
          </Card>
          <Card titulo="Resultado de las visitas">
            <BarrasHorizontales items={(data?.resultados ?? []).map((r) => ({ etiqueta: ETIQUETA_RESULTADO[r.resultado] ?? r.resultado, valor: r.count }))} />
          </Card>
        </div>

        {hayAlertas && (
          <Card titulo="Requiere atención" style={{ marginTop: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
              <Alerta titulo="Sin ruta asignada" nombres={alertas.sinRuta} link="/rutas?filtro=sin_ruta" accion="Planear rutas" />
              <Alerta titulo="Su ruta se acaba en ≤2 días" nombres={alertas.porVencer} link="/rutas?filtro=por_vencer" accion="Renovar rutas" />
              <Alerta titulo="Con 5+ paradas atrasadas" nombres={alertas.atrasadas} link="/rutas" accion="Ver rutas" />
              <Alerta titulo="Sin visitas en el periodo" nombres={alertas.sinVisitas} link="/en-vivo" accion="Ver en vivo" />
              <Alerta titulo="Menos de 50% de visitas verificadas" nombres={alertas.noVerificadas} link="/visitas" accion="Revisar visitas" />
            </div>
          </Card>
        )}

        <Card titulo="Desempeño por vendedor" subtitulo="Haz clic en un encabezado para ordenar" style={{ marginTop: 14 }} padding="18px 0 6px">
          <div style={{ display: 'grid', gridTemplateColumns: GRID, padding: '0 20px 10px', fontSize: 12, fontWeight: 600, color: '#6f7d75', borderBottom: '1px solid #eef2ee', gap: 10 }}>
            <ThOrden k="nombre" orden={orden} setOrden={setOrden}>Vendedor</ThOrden>
            <ThOrden k="visitas" orden={orden} setOrden={setOrden} alinear="right">Visitas</ThOrden>
            <ThOrden k="diasActivos" orden={orden} setOrden={setOrden} alinear="right">Días activos</ThOrden>
            <ThOrden k="promedioDia" orden={orden} setOrden={setOrden} alinear="right">Prom./día</ThOrden>
            <ThOrden k="cumplimiento" orden={orden} setOrden={setOrden}>Cumplimiento de ruta</ThOrden>
            <ThOrden k="ubicacionValida" orden={orden} setOrden={setOrden}>Verificadas</ThOrden>
            <ThOrden k="ultimaVisita" orden={orden} setOrden={setOrden}>Última visita</ThOrden>
          </div>
          {filas.length === 0 && <div style={{ padding: 24, textAlign: 'center', color: '#9aa39c', fontSize: 13 }}>{data ? 'No hay vendedores en este filtro.' : 'Cargando…'}</div>}
          {filas.map((f) => (
            <div key={f.id} className="rowh" style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid #f2f5f2', fontSize: 13, gap: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Avatar color={f.color} iniciales={f.iniciales} size={32} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontWeight: 600, color: '#263238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.nombre}{f.estado === 'Baja' && <span style={{ color: '#a8322a', fontWeight: 500 }}> · baja</span>}</div>
                  <span style={prodBadgeStyle(f.producto)}>{f.producto}</span>
                </div>
              </div>
              <div style={num}>{f.visitas}</div>
              <div style={num}>{f.diasActivos}</div>
              <div style={num}>{f.promedioDia}</div>
              <div><Medidor pct={f.cumplimiento} /><div style={{ fontSize: 11, color: '#9aa39c', marginTop: 2 }}>{f.planeados ? `${f.cumplidos} de ${f.planeados}` : 'sin ruta en el periodo'}</div></div>
              <div><Medidor pct={f.ubicacionValida} ancho={60} /></div>
              <div style={{ color: '#5a665f' }}>{haceCuanto(f.ultimaVisita)}</div>
            </div>
          ))}
        </Card>
      </div>
    </div>
  );
}

const GRID = 'minmax(200px, 2fr) 70px 90px 80px minmax(150px, 1.3fr) minmax(120px, 1fr) 120px';
const num: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: '#263238' };

function Alerta({ titulo, nombres, link, accion }: { titulo: string; nombres: string[]; link: string; accion: string }) {
  if (!nombres.length) return null;
  return (
    <div style={{ border: '1px solid #f3dcc4', background: '#fffaf4', borderRadius: 10, padding: '12px 14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#7a4511' }}>{titulo}</span>
        <span style={{ fontSize: 20, fontWeight: 600, color: '#94500f' }}>{nombres.length}</span>
      </div>
      <div style={{ fontSize: 12.5, color: '#6f5a45', marginTop: 4, lineHeight: 1.45 }}>
        {nombres.slice(0, 4).join(', ')}{nombres.length > 4 ? ` y ${nombres.length - 4} más` : ''}
      </div>
      <Link to={link} style={{ display: 'inline-block', marginTop: 8, fontSize: 12.5, fontWeight: 600 }}>{accion} →</Link>
    </div>
  );
}

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, type DashboardSummary, type WeekBar, type ResultadosDonut, type ActividadVendedor } from '../api';
import { useFilters } from '../filters';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { estadoBadgeStyle, prodBadgeStyle } from '../badges';

function conicGradient(items: ResultadosDonut['items']): string {
  let acc = 0;
  const parts = items.map((it) => {
    const from = acc; acc += it.pct;
    return `${it.color} ${from}% ${acc}%`;
  });
  if (acc < 100) parts.push(`#b8c2ba ${acc}% 100%`);
  return `conic-gradient(${parts.join(', ')})`;
}

export function Dashboard() {
  const { fProducto, fVendedor } = useFilters();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [semana, setSemana] = useState<WeekBar[]>([]);
  const [resultados, setResultados] = useState<ResultadosDonut | null>(null);
  const [actividad, setActividad] = useState<ActividadVendedor[]>([]);

  useEffect(() => {
    api.dashboardSummary(fProducto, fVendedor).then(setSummary).catch(() => {});
    api.dashboardSemana(fProducto, fVendedor).then(setSemana).catch(() => {});
    api.dashboardResultados(fProducto, fVendedor).then(setResultados).catch(() => {});
    api.dashboardActividad(fProducto, fVendedor).then(setActividad).catch(() => {});
  }, [fProducto, fVendedor]);

  const maxVal = Math.max(1, ...semana.map((b) => b.val));

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" /></svg>}
        title="Dashboard"
        subtitle={`Resumen de la operación de campo · ${new Date().toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' })}`}
      />
      <FilterBar />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16 }}>
        <Kpi border="#0f5132" label="Visitas hoy" value={summary?.visitasHoy ?? '—'} sub={summary?.visitasAyerPct != null ? `${summary.visitasAyerPct >= 0 ? '▲' : '▼'} ${Math.abs(summary.visitasAyerPct)}% vs ayer` : 'sin datos de ayer'} subColor="#22a36c" />
        <Kpi border="#ef8b3e" label="Por visitar" value={summary?.porVisitar ?? '—'} sub="en listas de hoy" subColor="#8a978f" />
        <Kpi border="#2a6fdb" label="Conversión" value={summary ? `${summary.conversion}%` : '—'} sub="visitas → solicitud" subColor="#8a978f" />
        <Kpi border="#22a36c" label="Vendedores activos" value={<>{summary?.vendedoresActivos ?? '—'}<span style={{ fontSize: 18, color: '#8a978f' }}>/{summary?.vendedoresTotal ?? '—'}</span></>} sub="en el filtro actual" subColor="#8a978f" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#263238' }}>Visitas por día</div>
            <div style={{ fontSize: 12.5, color: '#8a978f' }}>Últimos 7 días</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, height: 170, paddingTop: 6 }}>
            {semana.map((b, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, height: '100%', justifyContent: 'flex-end' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#3a4a41' }}>{b.val}</div>
                <div style={{ width: '100%', maxWidth: 34, borderRadius: '7px 7px 0 0', background: i === semana.length - 1 ? '#0f5132' : '#8fcfae', height: `${Math.round((b.val / maxVal) * 150)}px` }} />
                <div style={{ fontSize: 11.5, color: '#8a978f' }}>{b.day}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#263238', marginBottom: 16 }}>Resultados de visita</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 20 }}>
            <div style={{ width: 120, height: 120, borderRadius: '50%', flex: 'none', background: resultados ? conicGradient(resultados.items) : '#eef2ee', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ width: 74, height: 74, borderRadius: '50%', background: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ fontSize: 22, fontWeight: 600, color: '#263238' }}>{resultados?.total ?? 0}</div>
                <div style={{ fontSize: 10.5, color: '#8a978f' }}>visitas</div>
              </div>
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 9 }}>
              {(resultados?.items ?? []).map((it) => (
                <div key={it.resultado} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3a4a41' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />
                  {it.resultado} <b style={{ marginLeft: 'auto', color: '#263238' }}>{it.pct}%</b>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 22px 12px' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#263238' }}>Actividad por vendedor · hoy</div>
          <Link to="/seguimiento" style={{ fontSize: 13, fontWeight: 500 }}>Ver seguimiento en vivo →</Link>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr .8fr .9fr', padding: '0 22px 8px', fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: '#8a978f', borderBottom: '1px solid #eef2ee' }}>
          <div>VENDEDOR</div><div>PRODUCTO</div><div>CIUDAD</div><div>VISITAS HOY</div><div>ESTADO</div>
        </div>
        {actividad.map((v) => (
          <div key={v.id} className="rowh" style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1fr .8fr .9fr', alignItems: 'center', padding: '13px 22px', borderBottom: '1px solid #f2f5f2', fontSize: 13.5 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: v.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600 }}>{v.iniciales}</span>
              <span style={{ fontWeight: 500, color: '#263238' }}>{v.nombre}</span>
            </div>
            <div><span style={prodBadgeStyle(v.producto)}>{v.producto}</span></div>
            <div style={{ color: '#5a665f' }}>{v.ciudad}</div>
            <div style={{ color: '#263238', fontWeight: 600 }}>{v.hoy}</div>
            <div><span style={estadoBadgeStyle(v.estado)}>{v.estado}</span></div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Kpi({ border, label, value, sub, subColor }: { border: string; label: string; value: React.ReactNode; sub: string; subColor: string }) {
  return (
    <div className="kcard" style={{ background: '#fff', border: '1px solid #e6ece7', borderLeft: `4px solid ${border}`, borderRadius: 10, padding: '18px 20px' }}>
      <div style={{ fontSize: 13, color: '#6f7d75' }}>{label}</div>
      <div style={{ fontSize: 34, fontWeight: 500, color: '#263238', marginTop: 6 }}>{value}</div>
      <div style={{ fontSize: 12.5, fontWeight: 500, color: subColor, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

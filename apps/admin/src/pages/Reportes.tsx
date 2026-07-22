import { useEffect, useState } from 'react';
import { api, type ReportesSummary, type ReporteVendedor, type Evidencia, type ResultadosDonut, type MapaCalorResponse } from '../api';
import { useFilters } from '../filters';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { GeoMap } from '../components/GeoMap';

const VENDEDORES_POR_PAGINA = 8;

export function Reportes() {
  const { fProducto, fVendedor, fDesde, fHasta } = useFilters();
  const [summary, setSummary] = useState<ReportesSummary | null>(null);
  const [vendedores, setVendedores] = useState<ReporteVendedor[]>([]);
  const [resultados, setResultados] = useState<ResultadosDonut | null>(null);
  const [evidencias, setEvidencias] = useState<Evidencia[]>([]);
  const [calor, setCalor] = useState<MapaCalorResponse | null>(null);
  const [pagina, setPagina] = useState(0);

  useEffect(() => {
    const desde = fDesde ?? undefined;
    const hasta = fHasta ?? undefined;
    api.reportesSummary(fProducto, fVendedor, desde, hasta).then(setSummary).catch(() => {});
    api.reportesVendedores(fProducto, fVendedor, desde, hasta).then((v) => { setVendedores(v); setPagina(0); }).catch(() => {});
    api.dashboardResultados(fProducto, fVendedor, desde, hasta).then(setResultados).catch(() => {});
    api.reportesEvidencias(fProducto, fVendedor, desde, hasta).then(setEvidencias).catch(() => {});
    api.mapaCalor(fProducto, fVendedor, desde, hasta).then(setCalor).catch(() => {});
  }, [fProducto, fVendedor, fDesde, fHasta]);

  const totalPaginas = Math.max(1, Math.ceil(vendedores.length / VENDEDORES_POR_PAGINA));
  const vendedoresPagina = vendedores.slice(pagina * VENDEDORES_POR_PAGINA, (pagina + 1) * VENDEDORES_POR_PAGINA);

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="9" y1="15" x2="15" y2="15" /></svg>}
        title="Reportes" subtitle="Desempeño de la fuerza de campo"
        right={<button style={btnPrimary}><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>EXPORTAR</button>}
      />
      <FilterBar />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 16, marginBottom: 16 }}>
        <Kpi label="Visitas totales" value={summary?.visitasTotales ?? '—'} />
        <Kpi label="Solicitudes" value={summary?.solicitudes ?? '—'} />
        <Kpi label="Conversión" value={summary ? `${summary.conversion}%` : '—'} />
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderLeft: '4px solid #0f5132', borderRadius: 10, padding: '16px 20px' }}>
          <div style={{ fontSize: 13, color: '#6f7d75', display: 'flex', alignItems: 'center', gap: 6 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#0f5132" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>
            Km recorridos
          </div>
          <div style={{ fontSize: 30, fontWeight: 500, color: '#263238', marginTop: 4 }}>{summary?.kmRecorridos ?? '—'} <span style={{ fontSize: 15, color: '#8a978f' }}>km</span></div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#263238', marginBottom: 18 }}>Visitas por vendedor</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
            {vendedoresPagina.map((r) => (
              <div key={r.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, marginBottom: 6 }}>
                  <span style={{ fontWeight: 500, color: '#3a4a41' }}>{r.nombre}</span>
                  <span style={{ color: '#8a978f' }}>{r.total} visitas · {r.solicitudes} solic. · {r.km} km</span>
                </div>
                <div style={{ height: 12, borderRadius: 6, background: '#eef2ee', overflow: 'hidden', display: 'flex' }}>
                  <div style={{ height: '100%', width: r.w1, background: '#22a36c' }} />
                  <div style={{ height: '100%', width: r.w2, background: '#bfe6cf' }} />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 18 }}>
            <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#8a978f' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#22a36c' }} />Solicitudes</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: 3, background: '#bfe6cf' }} />Otras visitas</span>
            </div>
            {vendedores.length > VENDEDORES_POR_PAGINA && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12.5, color: '#6f7d75' }}>
                <button onClick={() => setPagina((p) => Math.max(0, p - 1))} disabled={pagina === 0} style={pageBtn(pagina === 0)}>‹</button>
                <span>{pagina + 1} de {totalPaginas}</span>
                <button onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))} disabled={pagina >= totalPaginas - 1} style={pageBtn(pagina >= totalPaginas - 1)}>›</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#263238', marginBottom: 16 }}>Resultados de visita</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {(resultados?.items ?? []).map((it) => (
              <div key={it.resultado} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3a4a41' }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: it.color }} />{it.resultado}<b style={{ marginLeft: 'auto', color: '#263238' }}>{it.count}</b>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: 16, marginTop: 16 }}>
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ fontSize: 15, fontWeight: 500, color: '#263238', marginBottom: 6 }}>Cobertura por zona</div>
          <div style={{ fontSize: 12.5, color: '#8a978f', marginBottom: 14 }}>
            Mapa de calor de visitas
            {calor && calor.visitasConUbicacion > 0 && ` · ${calor.visitasConUbicacion.toLocaleString('es-MX')} visitas con ubicación`}
          </div>
          <div style={{ position: 'relative', height: 480, borderRadius: 10, overflow: 'hidden', background: '#e7ece4' }}>
            <GeoMap heatPoints={calor?.puntos ?? []} height={480} />
            {calor && calor.puntos.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.72)', color: '#5a665f', fontSize: 12.5, fontWeight: 600, textAlign: 'center', padding: '0 30px' }}>
                Aún no hay visitas con ubicación GPS. El mapa se llena conforme los vendedores registran visitas desde la app.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: 16, marginTop: 12, fontSize: 11.5, color: '#8a978f' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f03b20' }} />Alta densidad</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fd8d3c' }} />Media</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fecc5c' }} />Baja</span>
          </div>
        </div>
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '20px 22px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#263238' }}>Evidencias recientes</div>
          </div>
          {evidencias.length === 0 ? (
            <div style={{ color: '#9aa39c', fontSize: 12.5, padding: '20px 0', textAlign: 'center' }}>Aún no hay fotos de evidencia capturadas.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12 }}>
              {evidencias.map((e) => (
                <div key={e.id} style={{ border: '1px solid #eef2ee', borderRadius: 9, overflow: 'hidden' }}>
                  <div style={{ position: 'relative', height: 88, backgroundImage: `url(${e.fotoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                    {e.ubicacionValida !== null && (
                      <span
                        title={e.ubicacionValida ? `Ubicación válida · ${e.distanciaValidacionMetros}m del negocio` : `Ubicación inválida · ${e.distanciaValidacionMetros}m del negocio (máx. 50m)`}
                        style={{
                          position: 'absolute', top: 6, right: 6, width: 18, height: 18, borderRadius: '50%',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          background: e.ubicacionValida ? '#22a36c' : '#c0392b', boxShadow: '0 1px 3px rgba(0,0,0,.35)',
                        }}
                      >
                        {e.ubicacionValida ? (
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>
                        ) : (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                        )}
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#263238', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.nombre}</div>
                    <div style={{ fontSize: 10.5, color: '#8a978f', marginTop: 2 }}>{e.resultado}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '16px 20px' }}>
      <div style={{ fontSize: 13, color: '#6f7d75' }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 500, color: '#263238', marginTop: 4 }}>{value}</div>
    </div>
  );
}

const btnPrimary: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, background: '#157347', color: '#fff', border: 'none',
  borderRadius: 6, padding: '10px 16px', fontSize: 13, fontWeight: 600, letterSpacing: '.4px',
};

function pageBtn(disabled: boolean): React.CSSProperties {
  return {
    width: 24, height: 24, border: '1px solid #e0e8e2', background: disabled ? '#f2f5f2' : '#fff',
    borderRadius: 6, color: disabled ? '#c3ccc5' : '#3a4a41', cursor: disabled ? 'default' : 'pointer', fontSize: 14, lineHeight: 1,
  };
}

import { useCallback, useEffect, useState } from 'react';
import { api, type VisitaListItem, type MapaCalorResponse, type RecorridoVendedor } from '../api';
import { useFilters } from '../filters';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { MultiSelectDropdown } from '../components/MultiSelectDropdown';
import { GeoMap } from '../components/GeoMap';
import { prodBadgeStyle, resultadoBadgeStyle } from '../badges';

const PAGE_SIZE = 20;
const RESULTADOS = [
  'Se realizó solicitud', 'Se dejó información', 'Cliente no interesado',
  'No es un negocio válido o existente', 'Se reagenda visita',
];

const gridCols = '54px 2fr 1.2fr 1.1fr 1.5fr 1fr .95fr';

export function Visitas() {
  const { fProductos, fVendedores, fDesde, fHasta } = useFilters();
  const [selResultados, setSelResultados] = useState<string[]>([]);

  const [items, setItems] = useState<VisitaListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightbox, setLightbox] = useState<{ fotos: string[]; index: number } | null>(null);

  const [showCalor, setShowCalor] = useState(true);
  const [showRutas, setShowRutas] = useState(false);
  const [calor, setCalor] = useState<MapaCalorResponse | null>(null);
  const [rutas, setRutas] = useState<RecorridoVendedor[]>([]);
  const [rutasError, setRutasError] = useState('');

  useEffect(() => {
    if (!showCalor) return;
    api.mapaCalor(fProductos, fVendedores, fDesde ?? undefined, fHasta ?? undefined).then(setCalor).catch(() => {});
  }, [showCalor, fProductos, fVendedores, fDesde, fHasta]);

  useEffect(() => {
    if (!showRutas) return;
    if (fVendedores.length === 0 && fProductos.length === 0) {
      setRutas([]);
      setRutasError('Elige uno o varios vendedores (o un producto) en los filtros de arriba para ver sus rutas.');
      return;
    }
    api.recorridos({
      vendedorIds: fVendedores.length ? fVendedores : undefined,
      productoIds: fVendedores.length ? undefined : fProductos,
      desde: fDesde ?? undefined, hasta: fHasta ?? undefined,
    }).then((r) => { setRutas(r); setRutasError(''); }).catch((err) => {
      setRutas([]);
      setRutasError(err.message || 'No se pudieron cargar las rutas.');
    });
  }, [showRutas, fProductos, fVendedores, fDesde, fHasta]);

  const cargar = useCallback((cursor?: string) => {
    const primeraPagina = !cursor;
    if (primeraPagina) setLoading(true); else setLoadingMore(true);
    api.visitas({
      // Un vendedor elegido a mano ya implica su producto — mandar ambos
      // filtros a la vez solo complicaría la resolución en el servidor.
      vendedorIds: fVendedores.length ? fVendedores : undefined,
      productoIds: fVendedores.length ? undefined : fProductos,
      resultados: selResultados,
      desde: fDesde ?? undefined, hasta: fHasta ?? undefined,
      cursor, limit: PAGE_SIZE,
    }).then((r) => {
      setItems((prev) => primeraPagina ? r.items : [...prev, ...r.items]);
      setNextCursor(r.nextCursor);
    }).catch(() => {
      if (primeraPagina) setItems([]);
    }).finally(() => { setLoading(false); setLoadingMore(false); });
  }, [fProductos, fVendedores, selResultados, fDesde, fHasta]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>}
        title="Visitas" subtitle="Consulta visitas de campo por vendedor, producto, resultado o fecha"
      />
      <FilterBar extra={
        <MultiSelectDropdown
          label="Resultado"
          options={RESULTADOS.map((r) => ({ value: r, label: r }))}
          selected={selResultados}
          onChange={setSelResultados}
          placeholder="Todos los resultados"
        />
      } />

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '20px 22px', marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 500, color: '#263238' }}>Cobertura del equipo</div>
            <div style={{ fontSize: 12.5, color: '#8a978f', marginTop: 2 }}>Mapa de calor de visitas y rutas GPS, según los filtros de arriba</div>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#3a4a41', cursor: 'pointer' }}>
              <input type="checkbox" checked={showCalor} onChange={(e) => setShowCalor(e.target.checked)} style={{ accentColor: '#157347', width: 14, height: 14 }} />
              Mapa de calor
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, color: '#3a4a41', cursor: 'pointer' }}>
              <input type="checkbox" checked={showRutas} onChange={(e) => setShowRutas(e.target.checked)} style={{ accentColor: '#157347', width: 14, height: 14 }} />
              Rutas GPS
            </label>
          </div>
        </div>
        <div style={{ position: 'relative', height: 440, borderRadius: 10, overflow: 'hidden', background: '#e7ece4' }}>
          <GeoMap heatPoints={showCalor ? (calor?.puntos ?? []) : []} recorridos={showRutas ? rutas : []} height={440} />
          {showRutas && rutasError && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.85)', color: '#5a665f', fontSize: 12.5, fontWeight: 600, textAlign: 'center', padding: '0 40px' }}>
              {rutasError}
            </div>
          )}
          {showCalor && !showRutas && calor && calor.puntos.length === 0 && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.72)', color: '#5a665f', fontSize: 12.5, fontWeight: 600, textAlign: 'center', padding: '0 30px' }}>
              Aún no hay visitas con ubicación GPS en este filtro.
            </div>
          )}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, marginTop: 12 }}>
          {showCalor && (
            <div style={{ display: 'flex', gap: 16, fontSize: 11.5, color: '#8a978f' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#f03b20' }} />Alta densidad</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fd8d3c' }} />Media</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 10, height: 10, borderRadius: '50%', background: '#fecc5c' }} />Baja</span>
            </div>
          )}
          {showRutas && rutas.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 11.5 }}>
              {rutas.map((r) => (
                <span key={r.vendedorId} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#3a4a41' }}>
                  <span style={{ width: 14, height: 3, borderRadius: 2, background: r.color }} />{r.nombre} · {r.puntos.length} pts
                </span>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#5a665f', borderBottom: '1px solid #eef2ee' }}>
          <div /><div>Negocio</div><div>Vendedor</div><div>Producto</div><div>Resultado</div><div>Ubicación</div><div>Fecha</div>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#8a978f', fontSize: 13 }}>Cargando visitas…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9aa39c', fontSize: 12.5 }}>No hay visitas con estos filtros.</div>
        ) : (
          items.map((v) => {
            // Un servidor desactualizado puede mandar filas sin `fotos`; sin
            // este respaldo, una sola fila así tumba la página completa.
            const fotos = v.fotos ?? [];
            return (
            <div key={v.id} style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid #f2f5f2', fontSize: 12.5 }}>
              <div>
                {fotos.length > 0 ? (
                  <div
                    onClick={() => setLightbox({ fotos, index: 0 })}
                    style={{ position: 'relative', width: 42, height: 42, borderRadius: 8, backgroundImage: `url(${fotos[0]})`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'zoom-in', border: '1px solid #eef2ee' }}
                  >
                    {fotos.length > 1 && (
                      <span style={{ position: 'absolute', right: -5, bottom: -5, background: '#157347', color: '#fff', fontSize: 10, fontWeight: 700, borderRadius: 9, padding: '1px 5px', boxShadow: '0 1px 3px rgba(0,0,0,.3)' }}>
                        +{fotos.length - 1}
                      </span>
                    )}
                  </div>
                ) : (
                  <div style={{ width: 42, height: 42, borderRadius: 8, background: '#f2f5f2' }} />
                )}
              </div>
              <div>
                <div style={{ fontWeight: 600, color: '#263238' }}>{v.nombreNegocio}</div>
                <div style={{ fontSize: 11, color: '#8a978f', marginTop: 1 }}>{v.direccion}</div>
                {v.notas && <div style={{ fontSize: 11, color: '#9aa39c', marginTop: 2, fontStyle: 'italic' }}>&ldquo;{v.notas}&rdquo;</div>}
              </div>
              <div style={{ color: '#3a4a41' }}>{v.vendedorNombre}</div>
              <div><span style={prodBadgeStyle(v.producto)}>{v.producto}</span></div>
              <div><span style={resultadoBadgeStyle(v.resultado)}>{v.resultado}</span></div>
              <div>
                {v.ubicacionValida === null ? (
                  <span style={{ color: '#9aa39c' }}>—</span>
                ) : (
                  <span title={`${v.distanciaValidacionMetros}m del negocio`} style={{ color: v.ubicacionValida ? '#1c7a4f' : '#c0392b', fontWeight: 600 }}>
                    {v.ubicacionValida ? '✓ Válida' : '✕ Inválida'}
                  </span>
                )}
              </div>
              <div style={{ color: '#8a978f' }}>
                {new Date(v.createdAt).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
              </div>
            </div>
            );
          })
        )}
        {nextCursor && (
          <div style={{ padding: 16, textAlign: 'center' }}>
            <button
              onClick={() => cargar(nextCursor)}
              disabled={loadingMore}
              style={{ background: '#f2f5f2', color: '#3a4a41', border: 'none', borderRadius: 8, padding: '10px 18px', fontSize: 13, fontWeight: 600, opacity: loadingMore ? 0.7 : 1, cursor: loadingMore ? 'default' : 'pointer' }}
            >
              {loadingMore ? 'Cargando…' : 'Cargar más'}
            </button>
          </div>
        )}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(20,40,30,.78)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, cursor: 'zoom-out' }}>
          <img src={lightbox.fotos[lightbox.index]} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, boxShadow: '0 24px 60px rgba(0,0,0,.4)' }} />
          {lightbox.fotos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: (lightbox.index - 1 + lightbox.fotos.length) % lightbox.fotos.length }); }}
                style={{ position: 'absolute', left: 24, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.9)', cursor: 'pointer' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#263238" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}><polyline points="15 18 9 12 15 6" /></svg>
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); setLightbox({ ...lightbox, index: (lightbox.index + 1) % lightbox.fotos.length }); }}
                style={{ position: 'absolute', right: 24, top: '50%', transform: 'translateY(-50%)', width: 44, height: 44, borderRadius: '50%', border: 'none', background: 'rgba(255,255,255,.9)', cursor: 'pointer' }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#263238" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ margin: '0 auto' }}><polyline points="9 18 15 12 9 6" /></svg>
              </button>
              <span style={{ position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)', background: 'rgba(255,255,255,.9)', color: '#263238', fontSize: 12.5, fontWeight: 700, borderRadius: 20, padding: '5px 12px' }}>
                {lightbox.index + 1} / {lightbox.fotos.length}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
}

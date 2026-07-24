import { useCallback, useEffect, useState } from 'react';
import { api, type VisitaListItem } from '../api';
import { useFilters } from '../filters';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { MultiSelectDropdown } from '../components/MultiSelectDropdown';
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
  const [lightbox, setLightbox] = useState<string | null>(null);

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

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: gridCols, padding: '12px 20px', fontSize: 12, fontWeight: 600, color: '#5a665f', borderBottom: '1px solid #eef2ee' }}>
          <div /><div>Negocio</div><div>Vendedor</div><div>Producto</div><div>Resultado</div><div>Ubicación</div><div>Fecha</div>
        </div>
        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#8a978f', fontSize: 13 }}>Cargando visitas…</div>
        ) : items.length === 0 ? (
          <div style={{ padding: 30, textAlign: 'center', color: '#9aa39c', fontSize: 12.5 }}>No hay visitas con estos filtros.</div>
        ) : (
          items.map((v) => (
            <div key={v.id} style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', padding: '10px 20px', borderBottom: '1px solid #f2f5f2', fontSize: 12.5 }}>
              <div>
                {v.fotoUrl ? (
                  <div
                    onClick={() => setLightbox(v.fotoUrl)}
                    style={{ width: 42, height: 42, borderRadius: 8, backgroundImage: `url(${v.fotoUrl})`, backgroundSize: 'cover', backgroundPosition: 'center', cursor: 'zoom-in', border: '1px solid #eef2ee' }}
                  />
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
          ))
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
          <img src={lightbox} style={{ maxWidth: '90vw', maxHeight: '90vh', borderRadius: 10, boxShadow: '0 24px 60px rgba(0,0,0,.4)' }} />
        </div>
      )}
    </div>
  );
}

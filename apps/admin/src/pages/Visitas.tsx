import { useCallback, useEffect, useState } from 'react';
import { api, type VisitaListItem } from '../api';
import { useFilters } from '../filters';
import { PageHeader } from '../components/FilterBar';
import { RANGO_LABELS, type RangoPreset } from '../lib/dateRanges';
import { prodBadgeStyle, resultadoBadgeStyle } from '../badges';

const PAGE_SIZE = 20;
const RESULTADOS = [
  'Se realizó solicitud', 'Se dejó información', 'Cliente no interesado',
  'No es un negocio válido o existente', 'Se reagenda visita',
];

const dateInputStyle: React.CSSProperties = {
  border: '1px solid #d9e1db', background: '#fff', borderRadius: 8, padding: '8px 10px', fontSize: 13, color: '#263238',
};

const gridCols = '54px 2fr 1.2fr 1.1fr 1.5fr 1fr .95fr';

export function Visitas() {
  const {
    productos, vendedores, fRango, setFRango,
    fDesdePersonalizado, fHastaPersonalizado, setFDesdePersonalizado, setFHastaPersonalizado,
    fDesde, fHasta,
  } = useFilters();

  const [selProductos, setSelProductos] = useState<string[]>([]);
  const [selVendedores, setSelVendedores] = useState<string[]>([]);
  const [selResultados, setSelResultados] = useState<string[]>([]);

  const [items, setItems] = useState<VisitaListItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  // Solo muestra en el chip-selector de vendedor a quienes pertenecen a algún
  // producto elegido — igual que el filtro compartido del resto del admin.
  const vendedoresDisponibles = selProductos.length
    ? vendedores.filter((v) => selProductos.includes(v.productoId))
    : vendedores;

  const toggleProducto = (id: string) => {
    setSelProductos((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      if (next.length) {
        setSelVendedores((vs) => vs.filter((vid) => {
          const v = vendedores.find((x) => x.id === vid);
          return v && next.includes(v.productoId);
        }));
      }
      return next;
    });
  };
  const toggleVendedor = (id: string) => setSelVendedores((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const toggleResultado = (r: string) => setSelResultados((prev) => prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r]);

  const cargar = useCallback((cursor?: string) => {
    const primeraPagina = !cursor;
    if (primeraPagina) setLoading(true); else setLoadingMore(true);
    api.visitas({
      // Un vendedor elegido a mano ya implica su producto — mandar ambos
      // filtros a la vez solo complicaría la resolución en el servidor.
      vendedorIds: selVendedores.length ? selVendedores : undefined,
      productoIds: selVendedores.length ? undefined : selProductos,
      resultados: selResultados,
      desde: fDesde ?? undefined, hasta: fHasta ?? undefined,
      cursor, limit: PAGE_SIZE,
    }).then((r) => {
      setItems((prev) => primeraPagina ? r.items : [...prev, ...r.items]);
      setNextCursor(r.nextCursor);
    }).catch(() => {
      if (primeraPagina) setItems([]);
    }).finally(() => { setLoading(false); setLoadingMore(false); });
  }, [selProductos, selVendedores, selResultados, fDesde, fHasta]);

  useEffect(() => { cargar(); }, [cargar]);

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>}
        title="Visitas" subtitle="Consulta visitas de campo por vendedor, producto, resultado o fecha"
      />

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '18px 20px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 15 }}>
        <FilterGroup label="Producto">
          <ChipMultiSelect options={productos.map((p) => ({ value: p.id, label: p.nombre }))} selected={selProductos} onToggle={toggleProducto} />
        </FilterGroup>
        <FilterGroup label="Vendedor">
          <ChipMultiSelect options={vendedoresDisponibles.map((v) => ({ value: v.id, label: v.nombre }))} selected={selVendedores} onToggle={toggleVendedor} />
        </FilterGroup>
        <FilterGroup label="Resultado">
          <ChipMultiSelect options={RESULTADOS.map((r) => ({ value: r, label: r }))} selected={selResultados} onToggle={toggleResultado} />
        </FilterGroup>
        <FilterGroup label="Fecha">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative' }}>
              <select className="fsel" value={fRango} onChange={(e) => setFRango(e.target.value as RangoPreset)}>
                {(Object.keys(RANGO_LABELS) as RangoPreset[]).map((r) => <option key={r} value={r}>{RANGO_LABELS[r]}</option>)}
              </select>
            </div>
            {fRango === 'personalizado' && (
              <>
                <input type="date" value={fDesdePersonalizado ?? ''} onChange={(e) => setFDesdePersonalizado(e.target.value || null)} style={dateInputStyle} />
                <span style={{ color: '#8a978f', fontSize: 12.5 }}>a</span>
                <input type="date" value={fHastaPersonalizado ?? ''} onChange={(e) => setFHastaPersonalizado(e.target.value || null)} style={dateInputStyle} />
              </>
            )}
          </div>
        </FilterGroup>
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

function FilterGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.4px', color: '#8a978f', marginBottom: 8, textTransform: 'uppercase' }}>{label}</div>
      {children}
    </div>
  );
}

function ChipMultiSelect({ options, selected, onToggle }: { options: { value: string; label: string }[]; selected: string[]; onToggle: (value: string) => void }) {
  if (options.length === 0) return <span style={{ fontSize: 12, color: '#9aa39c' }}>—</span>;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((opt) => {
        const on = selected.includes(opt.value);
        return (
          <div
            key={opt.value}
            onClick={() => onToggle(opt.value)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 20, fontSize: 12.5, fontWeight: 500,
              cursor: 'pointer', border: '1.5px solid', background: on ? '#0f5132' : '#f8faf8', borderColor: on ? '#0f5132' : '#d9e1db', color: on ? '#fff' : '#3a4a41',
            }}
          >
            {on && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12l5 5L20 7" /></svg>}
            {opt.label}
          </div>
        );
      })}
    </div>
  );
}

import { useState } from 'react';
import { useFilters } from '../filters';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { RouteWizard } from '../components/RouteWizard';
import { prodBadgeStyle, estadoBadgeStyle } from '../badges';

export function Rutas() {
  const { vendedoresFiltrados, reload } = useFilters();
  const [search, setSearch] = useState('');
  const [wizardVendorId, setWizardVendorId] = useState<string | null>(null);

  const visibles = vendedoresFiltrados.filter((v) => v.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>}
        title="Rutas por vendedor" subtitle="Asigna a cada vendedor su ciudad y giros; el DENUE arma su lista de prospectos a visitar"
      />
      <FilterBar />

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 14px' }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#263238' }}>Vendedores</div>
          <button
            onClick={() => setWizardVendorId(visibles[0]?.id || vendedoresFiltrados[0]?.id || null)}
            style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#157347', color: '#fff', border: 'none', borderRadius: 6, padding: '11px 18px', fontSize: 13, fontWeight: 600, letterSpacing: '.4px' }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            CONFIGURAR RUTA
          </button>
        </div>
        <div style={{ padding: '0 22px 16px', display: 'flex', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, borderBottom: '1.5px solid #d9e1db', padding: '8px 4px', width: 360 }}>
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#9aa39c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar vendedor..." style={{ border: 'none', outline: 'none', fontSize: 14, flex: 1, background: 'transparent' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1.2fr 2fr .8fr .8fr', padding: '0 22px 12px', fontSize: 12.5, fontWeight: 500, color: '#5a665f', borderBottom: '1px solid #eef2ee' }}>
          <div>Vendedor</div><div>Producto</div><div>Ciudad / Kiosco</div><div>Giros asignados</div><div>Prospectos</div><div>Estado</div>
        </div>
        {visibles.map((v) => (
          <div key={v.id} className="rowh" onClick={() => setWizardVendorId(v.id)} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.2fr 1.2fr 2fr .8fr .8fr', alignItems: 'center', padding: '14px 22px', borderBottom: '1px solid #f2f5f2', fontSize: 13, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 34, height: 34, borderRadius: '50%', background: v.color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12.5, fontWeight: 600 }}>{v.iniciales}</span>
              <span style={{ fontWeight: 600, color: '#263238' }}>{v.nombre}</span>
            </div>
            <div><span style={prodBadgeStyle(v.producto)}>{v.producto}</span></div>
            <div style={{ color: '#5a665f' }}>
              <div>{v.ciudad}</div>
              <div style={{ fontSize: 11, color: '#9aa39c', marginTop: 1 }}>+ alrededores</div>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              {v.giros.length === 0 ? (
                <span style={{ fontSize: 11, color: '#9aa39c' }}>Solo evidencia</span>
              ) : v.giros.map((g) => (
                <span key={g} style={{ fontSize: 11, fontWeight: 500, color: '#3a4a41', background: '#eef2ee', padding: '3px 9px', borderRadius: 6 }}>{g}</span>
              ))}
            </div>
            <div style={{ color: '#263238', fontWeight: 600 }}>{v.prospectosCount ?? 0}</div>
            <div><span style={estadoBadgeStyle(v.estado)}>{v.estado}</span></div>
          </div>
        ))}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 22, padding: '14px 22px', fontSize: 13, color: '#6f7d75' }}>
          <span>{visibles.length} de {vendedoresFiltrados.length}</span>
        </div>
      </div>

      {wizardVendorId && (
        <RouteWizard vendedorId={wizardVendorId} onClose={() => setWizardVendorId(null)} onSaved={reload} />
      )}
    </div>
  );
}

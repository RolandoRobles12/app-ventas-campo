import { useEffect, useState } from 'react';
import { api } from '../api';
import { useFilters } from '../filters';
import { useToast } from '../toast';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { RouteWizard } from '../components/RouteWizard';
import { prodBadgeStyle, estadoBadgeStyle } from '../badges';

export function Rutas() {
  const { vendedoresFiltrados, reload } = useFilters();
  const { showToast } = useToast();
  const [search, setSearch] = useState('');
  const [wizardVendorId, setWizardVendorId] = useState<string | null>(null);
  const [avivaHrConfigured, setAvivaHrConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);

  useEffect(() => {
    api.avivaHrStatus().then((r) => setAvivaHrConfigured(r.configured)).catch(() => {});
  }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await api.avivaHrImportar();
      const sinPosicion = res.omitidos.filter((o) => o.motivo.startsWith('posición sin mapear')).length;
      const sinCatalogo = res.omitidos.length - sinPosicion;
      const partes = [`${res.creados} nuevos`, `${res.actualizados} actualizados`];
      if (sinPosicion) partes.push(`${sinPosicion} sin posición reconocida`);
      if (sinCatalogo) partes.push(`${sinCatalogo} sin producto en el catálogo (revisa que existan "Aviva Tu Negocio" / "Aviva Casa Marchand" / "Aviva Construrama" en Productos)`);
      showToast(`Sincronización completada · ${partes.join(' · ')}`);
      reload();
    } catch (err: any) {
      showToast(err.code === 'AVIVA_HR_NOT_CONFIGURED' ? 'Configura AVIVA_HR_PROJECT_ID en el servidor para importar desde aviva-hr.' : (err.message || 'Error al sincronizar'));
    } finally {
      setSyncing(false);
    }
  };

  const visibles = vendedoresFiltrados.filter((v) => v.nombre.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>}
        title="Rutas por vendedor" subtitle="Asigna a cada vendedor su ciudad y giros; el DENUE arma su lista de prospectos a visitar"
      />
      <FilterBar />

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '14px 20px', display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#263238' }}>aviva-hr · Directorio de empleados</div>
          <div style={{ fontSize: 12.5, color: '#8a978f' }}>Importa vendedores reales por posición (Aviva Tu Negocio, Aviva Tu Casa, Casa Marchand)</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, borderRadius: 20, padding: '6px 14px',
          background: avivaHrConfigured ? '#e9f7ef' : '#fdecdb', border: `1px solid ${avivaHrConfigured ? '#bfe6cf' : '#ffd9c2'}`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: avivaHrConfigured ? '#22a36c' : '#e07a26' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: avivaHrConfigured ? '#0f5132' : '#c96a1e' }}>{avivaHrConfigured ? 'Conectado' : 'No configurado'}</span>
        </div>
        <button
          onClick={sync}
          disabled={syncing || !avivaHrConfigured}
          style={{ background: '#f2f5f2', color: '#3a4a41', border: 'none', borderRadius: 8, padding: '10px 15px', fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, opacity: (syncing || !avivaHrConfigured) ? 0.6 : 1 }}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3a4a41" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          {syncing ? 'Sincronizando…' : 'Sincronizar desde aviva-hr'}
        </button>
      </div>
      {!avivaHrConfigured && (
        <div style={{ background: '#fff3ec', border: '1px solid #ffd9c2', color: '#c96a1e', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
          Configura <b>AVIVA_HR_PROJECT_ID</b> en el servidor para importar vendedores reales desde aviva-hr.
        </div>
      )}

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

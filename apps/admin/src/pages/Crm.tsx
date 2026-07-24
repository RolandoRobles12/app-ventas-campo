import { useEffect, useState } from 'react';
import { api, type CrmDeal } from '../api';
import { useFilters } from '../filters';
import { useToast } from '../toast';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { etapaBadgeStyle } from '../badges';
import { DealDrawer } from '../components/DealDrawer';

const STAGE_ACCENTS: Record<string, string> = {
  'Documentos subidos': '#2a6fdb', 'Documentos verificados': '#0e8a8a', 'Aprobado': '#22a36c',
  'Contrato enviado': '#c96a1e', 'Desembolso': '#0f5132', 'Rechazado': '#c0392b',
};

export function Crm() {
  const { fProductos, fVendedores, fDesde, fHasta } = useFilters();
  const { showToast } = useToast();
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [status, setStatus] = useState<{ configured: boolean } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<CrmDeal | null>(null);

  const load = () => {
    api.crmDeals(fProductos, fVendedores, fDesde ?? undefined, fHasta ?? undefined).then(setDeals).catch(() => {});
  };

  useEffect(load, [fProductos, fVendedores, fDesde, fHasta]);
  useEffect(() => { api.crmStatus().then(setStatus).catch(() => {}); }, []);

  const sync = async () => {
    setSyncing(true);
    try {
      const res = await api.crmSync();
      showToast(`Sincronización completada · ${res.created} nuevos, ${res.updated} actualizados`);
      load();
    } catch (err: any) {
      showToast(err.code === 'HUBSPOT_NOT_CONFIGURED' ? 'Configura HUBSPOT_TOKEN en el servidor para sincronizar con HubSpot.' : (err.message || 'Error al sincronizar'));
    } finally {
      setSyncing(false);
    }
  };

  const stageCounts = STAGE_ACCENTS && Object.keys(STAGE_ACCENTS).map((stage) => ({
    stage, count: deals.filter((d) => d.etapa === stage).length, accent: STAGE_ACCENTS[stage],
  }));

  const visibles = deals.filter((d) => d.cliente.toLowerCase().includes(search.toLowerCase()) || d.negocio.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></svg>}
        title="CRM · Prospectos" subtitle="Deals sincronizados desde HubSpot"
      />
      <FilterBar />

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '16px 20px', display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#fff3ec', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #ffd9c2' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="#ff7a59"><circle cx="12" cy="12" r="4" /><circle cx="19" cy="6" r="2.4" /></svg>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#263238' }}>HubSpot CRM</div>
          <div style={{ fontSize: 12.5, color: '#8a978f' }}>{deals.filter((d) => d.source === 'hubspot').length} deals sincronizados de {deals.length} totales</div>
        </div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8, borderRadius: 20, padding: '6px 14px',
          background: status?.configured ? '#e9f7ef' : '#fdecdb', border: `1px solid ${status?.configured ? '#bfe6cf' : '#ffd9c2'}`,
        }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: status?.configured ? '#22a36c' : '#e07a26' }} />
          <span style={{ fontSize: 12.5, fontWeight: 600, color: status?.configured ? '#0f5132' : '#c96a1e' }}>{status?.configured ? 'Conectado' : 'No configurado'}</span>
        </div>
        <button onClick={sync} disabled={syncing} style={{ background: '#f2f5f2', color: '#3a4a41', border: 'none', borderRadius: 8, padding: '10px 15px', fontSize: 13.5, fontWeight: 500, display: 'flex', alignItems: 'center', gap: 8, opacity: syncing ? 0.7 : 1 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#3a4a41" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 4 23 10 17 10" /><polyline points="1 20 1 14 7 14" /><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" /></svg>
          {syncing ? 'Sincronizando…' : 'Sincronizar'}
        </button>
        <button onClick={() => window.open('https://app.hubspot.com', '_blank')} style={{ background: '#ff7a59', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 16px', fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
          Abrir en HubSpot
        </button>
      </div>
      {!status?.configured && (
        <div style={{ background: '#fff3ec', border: '1px solid #ffd9c2', color: '#c96a1e', borderRadius: 8, padding: '10px 14px', fontSize: 12.5, marginBottom: 16 }}>
          Configura <b>HUBSPOT_TOKEN</b> y <b>HUBSPOT_PORTAL_ID</b> en el servidor para sincronizar deals reales y abrir enlaces directos a HubSpot.
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6,1fr)', gap: 12, marginBottom: 16 }}>
        {stageCounts.map((s) => (
          <div key={s.stage} style={{ background: '#fff', border: '1px solid #e6ece7', borderTop: `3px solid ${s.accent}`, borderRadius: 10, padding: '13px 15px' }}>
            <div style={{ fontSize: 12, color: '#6f7d75' }}>{s.stage}</div>
            <div style={{ fontSize: 24, fontWeight: 500, color: '#263238', marginTop: 3 }}>{s.count}</div>
          </div>
        ))}
      </div>

      <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 22px', borderBottom: '1px solid #eef2ee' }}>
          <div style={{ fontSize: 17, fontWeight: 500, color: '#263238' }}>Deals sincronizados</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, border: '1px solid #e0e8e2', borderRadius: 8, padding: '7px 12px', width: 250 }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#9aa39c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar deal..." style={{ border: 'none', outline: 'none', fontSize: 13, flex: 1, background: 'transparent' }} />
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.4fr 1.3fr .8fr 1fr 1fr .5fr', padding: '11px 22px', fontSize: 12, fontWeight: 700, letterSpacing: '.5px', color: '#8a978f', borderBottom: '1px solid #eef2ee' }}>
          <div>DEAL (CLIENTE)</div><div>NEGOCIO</div><div>DEAL STAGE</div><div>AMOUNT</div><div>DEAL OWNER</div><div>SERVICE OWNER</div><div></div>
        </div>
        {visibles.map((d) => (
          <div key={d.id} className="rowh" onClick={() => setEditing(d)} style={{ display: 'grid', gridTemplateColumns: '1.3fr 1.4fr 1.3fr .8fr 1fr 1fr .5fr', alignItems: 'center', padding: '13px 22px', borderBottom: '1px solid #f2f5f2', fontSize: 13, cursor: 'pointer' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ width: 30, height: 30, borderRadius: '50%', background: '#22a36c', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11.5, fontWeight: 600 }}>{d.cliente.split(' ').map((p) => p[0]).slice(0, 2).join('')}</span>
              <span style={{ fontWeight: 600, color: '#263238' }}>{d.cliente}</span>
            </div>
            <div style={{ color: '#5a665f' }}>{d.negocio}</div>
            <div><span style={etapaBadgeStyle(d.etapa)}>{d.etapa}</span></div>
            <div style={{ color: '#263238', fontWeight: 600 }}>{d.amount != null ? `$${d.amount.toLocaleString('es-MX')}` : '—'}</div>
            <div style={{ color: '#5a665f' }}>{d.dealOwner || '—'}</div>
            <div style={{ color: '#5a665f' }}>{d.serviceOwner || '—'}</div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (d.hubspotUrl) window.open(d.hubspotUrl, '_blank');
                  else showToast('Este deal no está vinculado a HubSpot todavía.');
                }}
                title="Abrir en HubSpot"
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, background: '#fff3ec', border: 'none' }}
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#ff7a59" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && <DealDrawer deal={editing} onClose={() => setEditing(null)} onSaved={load} />}
    </div>
  );
}

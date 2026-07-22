import { useEffect, useMemo, useState } from 'react';
import { api, type MapaLeadsResponse } from '../api';
import { useFilters } from '../filters';
import { FilterBar, PageHeader } from '../components/FilterBar';
import { GeoMap, type MapPin } from '../components/GeoMap';
import { estadoProspectoBadgeStyle } from '../badges';

export function Mapa() {
  const { fProducto, fVendedor, fDesde, fHasta } = useFilters();
  const [data, setData] = useState<MapaLeadsResponse | null>(null);

  useEffect(() => {
    api.mapaLeads(fProducto, fVendedor, fDesde ?? undefined, fHasta ?? undefined).then(setData).catch(() => {});
  }, [fProducto, fVendedor, fDesde, fHasta]);

  const leads = data?.leads ?? [];
  const pins = useMemo<MapPin[]>(
    () => (data?.leads ?? []).map((l) => ({ id: l.id, lat: l.lat, lng: l.lng, color: l.color, title: l.nombre, subtitle: `${l.direccion}${l.vendedor ? ` · ${l.vendedor}` : ''}` })),
    [data],
  );

  return (
    <div className="screen">
      <PageHeader
        icon={<svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#157347" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>}
        title="Mapa de Leads" subtitle="Leads geolocalizados por producto y estado"
      />
      <FilterBar />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 16, alignItems: 'start' }}>
        <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ position: 'relative', height: 540, background: '#e7ece4', overflow: 'hidden' }}>
            <GeoMap pins={pins} height={540} />
            {data && leads.length === 0 && (
              <div style={{ position: 'absolute', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,.72)', color: '#5a665f', fontSize: 13, fontWeight: 600, textAlign: 'center', padding: '0 40px' }}>
                Sin leads con coordenadas GPS todavía. Consulta el DENUE desde "Rutas por vendedor" para traer negocios con ubicación real.
              </div>
            )}
            <div style={{ position: 'absolute', right: 16, top: 16, zIndex: 600, background: '#fff', borderRadius: 10, padding: '13px 16px', boxShadow: '0 3px 10px rgba(0,0,0,.1)', display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '.5px', color: '#8a978f' }}>ESTADO</div>
              <Legend color="#ef8b3e" label="Por visitar" />
              <Legend color="#22a36c" label="Visitado" />
              <Legend color="#2a6fdb" label="Prospecto CRM" />
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ background: '#fff', border: '1px solid #e6ece7', borderRadius: 10, padding: '16px 18px' }}>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#263238', marginBottom: 12 }}>Leads en el mapa</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
              <Row label="Total" value={data?.totales.total ?? 0} color="#263238" />
              <Row label="Por visitar" value={data?.totales.porVisitar ?? 0} color="#ef8b3e" />
              <Row label="Visitados" value={data?.totales.visitados ?? 0} color="#22a36c" />
              <Row label="Sincronizados CRM" value={data?.totales.sincronizadosCrm ?? 0} color="#2a6fdb" />
            </div>
          </div>
          {leads.slice(0, 6).map((l) => (
            <div key={l.id} className="kcard" style={{ background: '#fff', border: '1px solid #e6ece7', borderLeft: `4px solid ${l.color}`, borderRadius: 10, padding: '13px 15px' }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: '#263238' }}>{l.nombre}</div>
              <div style={{ fontSize: 12, color: '#8a978f', marginTop: 2 }}>{l.direccion}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
                <span style={estadoProspectoBadgeStyle(l.estado)}>{l.estado === 'visitado' ? 'Visitado' : 'Por visitar'}</span>
                <span style={{ fontSize: 11.5, color: '#8a978f' }}>{l.vendedor}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: '#3a4a41' }}>
      <span style={{ width: 11, height: 11, borderRadius: '50%', background: color }} />{label}
    </div>
  );
}

function Row({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: '#5a665f' }}>{label}</span><b style={{ color }}>{value.toLocaleString('es-MX')}</b>
    </div>
  );
}

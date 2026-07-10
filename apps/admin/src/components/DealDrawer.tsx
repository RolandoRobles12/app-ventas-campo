import { useState } from 'react';
import { api, type CrmDeal } from '../api';
import { useFilters } from '../filters';
import { useToast } from '../toast';

const STAGES = ['Documentos subidos', 'Documentos verificados', 'Aprobado', 'Contrato enviado', 'Desembolso', 'Rechazado'];

export function DealDrawer({ deal, onClose, onSaved }: { deal: CrmDeal; onClose: () => void; onSaved: () => void }) {
  const { vendedores } = useFilters();
  const { showToast } = useToast();
  const [cliente, setCliente] = useState(deal.cliente);
  const [negocio, setNegocio] = useState(deal.negocio);
  const [etapa, setEtapa] = useState(deal.etapa);
  const [amount, setAmount] = useState(String(deal.amount ?? ''));
  const [dealOwnerId, setDealOwnerId] = useState(deal.dealOwnerId || '');
  const [serviceOwner, setServiceOwner] = useState(deal.serviceOwner || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const result = await api.crmUpdate(deal.id, {
        cliente, negocio, etapa, amount: amount ? Number(amount) : undefined, dealOwnerId: dealOwnerId || undefined, serviceOwner,
      });
      showToast(result.hubspotWarning || 'Deal actualizado y sincronizado con HubSpot');
      onSaved();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'No se pudo guardar el deal');
    } finally {
      setSaving(false);
    }
  };

  const openHubspot = () => {
    if (deal.hubspotUrl) {
      window.open(deal.hubspotUrl, '_blank');
    } else {
      showToast('Este deal aún no está vinculado a HubSpot (sincroniza primero) o falta configurar HUBSPOT_PORTAL_ID.');
    }
  };

  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(20,40,30,.42)', display: 'flex', justifyContent: 'flex-end', zIndex: 50 }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: 440, height: '100%', background: '#fff', boxShadow: '-16px 0 50px rgba(0,0,0,.2)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '22px 26px 18px', borderBottom: '1px solid #eef2ee' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 19, fontWeight: 600, color: '#263238' }}>{cliente || 'Nuevo deal'}</div>
              <div style={{ fontSize: 13, color: '#8a978f', marginTop: 3 }}>{negocio} · {deal.producto}</div>
            </div>
            <button onClick={onClose} style={{ width: 32, height: 32, border: 'none', background: '#f2f5f2', borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#5a665f" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
            </button>
          </div>
        </div>
        <div className="adm-scroll" style={{ flex: 1, overflowY: 'auto', padding: '22px 26px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Field label="Deal (nombre del cliente)"><input value={cliente} onChange={(e) => setCliente(e.target.value)} style={inputStyle} /></Field>
          <Field label="Negocio"><input value={negocio} onChange={(e) => setNegocio(e.target.value)} style={inputStyle} /></Field>
          <Field label="Deal stage">
            <div style={{ position: 'relative' }}>
              <select value={etapa} onChange={(e) => setEtapa(e.target.value)} style={inputStyle}>
                {STAGES.map((s) => <option key={s}>{s}</option>)}
              </select>
            </div>
          </Field>
          <Field label="Amount (MXN · 2,000 – 20,000)"><input type="number" min={2000} max={20000} value={amount} onChange={(e) => setAmount(e.target.value)} style={inputStyle} /></Field>
          <Field label="Deal owner (vendedor)">
            <select value={dealOwnerId} onChange={(e) => setDealOwnerId(e.target.value)} style={inputStyle}>
              <option value="">— Sin asignar —</option>
              {vendedores.map((v) => <option key={v.id} value={v.id}>{v.nombre}</option>)}
            </select>
          </Field>
          <Field label="Service owner (agente de servicing)">
            <input value={serviceOwner} onChange={(e) => setServiceOwner(e.target.value)} placeholder="Ej. Paola Ríos" style={inputStyle} />
          </Field>
          <button onClick={openHubspot} style={{ marginTop: 4, textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: '#fff3ec', border: '1px solid #ffd9c2', color: '#e0562f', borderRadius: 9, padding: 12, fontSize: 13.5, fontWeight: 600 }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#e0562f" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /><polyline points="15 3 21 3 21 9" /><line x1="10" y1="14" x2="21" y2="3" /></svg>
            Abrir deal en HubSpot
          </button>
        </div>
        <div style={{ padding: '16px 26px 20px', borderTop: '1px solid #eef2ee', display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: '#f2f5f2', color: '#3a4a41', border: 'none', borderRadius: 8, padding: '11px 18px', fontSize: 14, fontWeight: 500 }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ background: '#157347', color: '#fff', border: 'none', borderRadius: 8, padding: '11px 20px', fontSize: 14, fontWeight: 600, opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: '#3a4a41', marginBottom: 6 }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%', WebkitAppearance: 'none', appearance: 'none', border: '1px solid #d9e1db', background: '#f8faf8',
  borderRadius: 8, padding: '11px 13px', fontSize: 14, color: '#263238',
};

import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';
import {
  fetchHubspotDeals, updateHubspotDeal, hubspotDealUrl, isHubspotConfigured,
  DEAL_STAGE_LABELS, listHubspotOwners,
} from '../integrations/hubspot.js';

export const crmRouter = Router();

interface CrmDealDoc {
  hubspotDealId: string | null;
  hubspotOwnerId?: string | null;
  hubspotCompanyId?: string | null;
  cliente: string;
  negocio: string;
  productoId?: string | null;
  etapa: string;
  amount: number | null;
  dealOwnerId?: string | null;
  dealOwnerLabel?: string | null;
  serviceOwner: string | null;
  source: 'hubspot' | 'local';
  lastSyncedAt: Timestamp | null;
  createdAt: Timestamp;
}

interface VendedorDoc {
  nombre: string;
  email: string | null;
}

async function shape(id: string, d: CrmDealDoc, productoNombre?: string, dealOwnerNombre?: string) {
  return {
    id,
    hubspotDealId: d.hubspotDealId,
    cliente: d.cliente,
    negocio: d.negocio,
    producto: productoNombre,
    etapa: d.etapa,
    amount: d.amount,
    dealOwner: dealOwnerNombre || d.dealOwnerLabel || null,
    dealOwnerId: d.dealOwnerId ?? null,
    serviceOwner: d.serviceOwner,
    source: d.source,
    lastSyncedAt: toIso(d.lastSyncedAt),
    hubspotUrl: d.hubspotDealId ? hubspotDealUrl(d.hubspotDealId) : null,
  };
}

async function lookupNames(deals: { id: string; data: CrmDealDoc }[]) {
  const productoIds = [...new Set(deals.map((d) => d.data.productoId).filter((v): v is string => !!v))];
  const dealOwnerIds = [...new Set(deals.map((d) => d.data.dealOwnerId).filter((v): v is string => !!v))];
  const productos = new Map<string, string>();
  const dealOwners = new Map<string, string>();
  await Promise.all([
    ...productoIds.map(async (id) => {
      const doc = await db.collection('productos').doc(id).get();
      if (doc.exists) productos.set(id, (doc.data() as { nombre: string }).nombre);
    }),
    ...dealOwnerIds.map(async (id) => {
      const doc = await db.collection('vendedores').doc(id).get();
      if (doc.exists) dealOwners.set(id, (doc.data() as VendedorDoc).nombre);
    }),
  ]);
  return { productos, dealOwners };
}

crmRouter.get('/status', (_req, res) => {
  res.json({ configured: isHubspotConfigured(), stages: DEAL_STAGE_LABELS });
});

crmRouter.get('/deals', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };

  let productoId: string | undefined;
  if (producto && producto !== 'Todos los productos') {
    const snap = await db.collection('productos').where('nombre', '==', producto).limit(1).get();
    productoId = snap.empty ? '__none__' : snap.docs[0].id;
  }
  let dealOwnerId: string | undefined;
  if (vendedor && vendedor !== 'Todos los vendedores') {
    const snap = await db.collection('vendedores').where('nombre', '==', vendedor).limit(1).get();
    dealOwnerId = snap.empty ? '__none__' : snap.docs[0].id;
  }

  const snap = await db.collection('crmDeals').orderBy('createdAt', 'desc').get();
  let deals = snap.docs.map((d) => ({ id: d.id, data: d.data() as CrmDealDoc }));
  if (productoId) deals = deals.filter((d) => d.data.productoId === productoId);
  if (dealOwnerId) deals = deals.filter((d) => d.data.dealOwnerId === dealOwnerId);

  const { productos, dealOwners } = await lookupNames(deals);
  res.json(await Promise.all(deals.map((d) => shape(d.id, d.data, productos.get(d.data.productoId || ''), dealOwners.get(d.data.dealOwnerId || '')))));
});

crmRouter.post('/sync', async (_req, res) => {
  if (!isHubspotConfigured()) {
    return res.status(501).json({ error: 'HUBSPOT_NOT_CONFIGURED', message: 'Configura HUBSPOT_TOKEN en el servidor para sincronizar con HubSpot.' });
  }
  try {
    const remote = await fetchHubspotDeals();
    const vendedoresSnap = await db.collection('vendedores').get();
    const vendedores = vendedoresSnap.docs.map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }));
    let created = 0, updated = 0;

    for (const rd of remote) {
      const dealOwner = vendedores.find((v) => v.nombre.toLowerCase() === (rd.dealOwnerLabel || '').toLowerCase());
      const existingSnap = await db.collection('crmDeals').where('hubspotDealId', '==', rd.hubspotDealId).limit(1).get();
      const data = {
        cliente: rd.cliente, negocio: rd.negocio, etapa: rd.etapa, amount: rd.amount,
        hubspotOwnerId: rd.hubspotOwnerId, dealOwnerLabel: rd.dealOwnerLabel,
        dealOwnerId: dealOwner?.id ?? null, serviceOwner: rd.serviceOwner,
        hubspotCompanyId: rd.hubspotCompanyId, source: 'hubspot' as const, lastSyncedAt: Timestamp.now(),
      };
      if (!existingSnap.empty) {
        await db.collection('crmDeals').doc(existingSnap.docs[0].id).update(data);
        updated++;
      } else {
        await db.collection('crmDeals').add({ ...data, hubspotDealId: rd.hubspotDealId, createdAt: Timestamp.now() });
        created++;
      }
    }
    res.json({ ok: true, created, updated, total: remote.length });
  } catch (err: any) {
    res.status(502).json({ error: 'HUBSPOT_SYNC_FAILED', message: err?.message || 'Error sincronizando con HubSpot' });
  }
});

crmRouter.get('/owners', async (_req, res) => {
  if (!isHubspotConfigured()) return res.json({ configured: false, owners: [] });
  try {
    const owners = await listHubspotOwners();
    res.json({ configured: true, owners });
  } catch (err: any) {
    res.status(502).json({ error: 'HUBSPOT_REQUEST_FAILED', message: err?.message });
  }
});

crmRouter.patch('/deals/:id', async (req, res) => {
  const { cliente, negocio, etapa, amount, dealOwnerId, serviceOwner } = req.body as {
    cliente?: string; negocio?: string; etapa?: string; amount?: number; dealOwnerId?: string; serviceOwner?: string;
  };
  const ref = db.collection('crmDeals').doc(req.params.id);
  const existingDoc = await ref.get();
  if (!existingDoc.exists) return res.status(404).json({ error: 'not_found' });
  const existing = existingDoc.data() as CrmDealDoc;

  const data: Record<string, unknown> = {};
  if (cliente !== undefined) data.cliente = cliente;
  if (negocio !== undefined) data.negocio = negocio;
  if (etapa !== undefined) data.etapa = etapa;
  if (amount !== undefined) data.amount = amount;
  if (dealOwnerId !== undefined) data.dealOwnerId = dealOwnerId || null;
  if (serviceOwner !== undefined) data.serviceOwner = serviceOwner;

  let hubspotWarning: string | undefined;
  if (existing.hubspotDealId && isHubspotConfigured()) {
    try {
      let hubspotOwnerId: string | undefined;
      if (dealOwnerId) {
        const vendedorDoc = await db.collection('vendedores').doc(dealOwnerId).get();
        const vendedor = vendedorDoc.data() as VendedorDoc | undefined;
        const owners = await listHubspotOwners();
        hubspotOwnerId = owners.find((o) => o.email.toLowerCase() === (vendedor?.email || '').toLowerCase())?.id;
      }
      await updateHubspotDeal(existing.hubspotDealId, { etapa, amount, hubspotOwnerId, serviceOwner });
    } catch (err: any) {
      hubspotWarning = `Se guardó localmente, pero no se pudo actualizar HubSpot: ${err?.message}`;
    }
  }

  await ref.update(data);
  const updated = { ...existing, ...data } as CrmDealDoc;
  const { productos, dealOwners } = await lookupNames([{ id: ref.id, data: updated }]);
  res.json({ ...(await shape(ref.id, updated, productos.get(updated.productoId || ''), dealOwners.get(updated.dealOwnerId || ''))), hubspotWarning });
});

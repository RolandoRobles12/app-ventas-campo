import { Router } from 'express';
import { prisma } from '../db.js';
import {
  fetchHubspotDeals, updateHubspotDeal, hubspotDealUrl, isHubspotConfigured,
  DEAL_STAGE_LABELS, listHubspotOwners,
} from '../integrations/hubspot.js';

export const crmRouter = Router();

function shape(d: any) {
  return {
    id: d.id,
    hubspotDealId: d.hubspotDealId,
    cliente: d.cliente,
    negocio: d.negocio,
    producto: d.producto?.nombre,
    etapa: d.etapa,
    amount: d.amount,
    dealOwner: d.dealOwner?.nombre || d.dealOwnerLabel || null,
    dealOwnerId: d.dealOwnerId,
    serviceOwner: d.serviceOwner,
    source: d.source,
    lastSyncedAt: d.lastSyncedAt,
    hubspotUrl: d.hubspotDealId ? hubspotDealUrl(d.hubspotDealId) : null,
  };
}

crmRouter.get('/status', (_req, res) => {
  res.json({ configured: isHubspotConfigured(), stages: DEAL_STAGE_LABELS });
});

crmRouter.get('/deals', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const where: any = {};
  if (producto && producto !== 'Todos los productos') where.producto = { nombre: producto };
  if (vendedor && vendedor !== 'Todos los vendedores') where.dealOwner = { nombre: vendedor };

  const deals = await prisma.crmDeal.findMany({
    where, include: { producto: true, dealOwner: true }, orderBy: { createdAt: 'desc' },
  });
  res.json(deals.map(shape));
});

crmRouter.post('/sync', async (_req, res) => {
  if (!isHubspotConfigured()) {
    return res.status(501).json({ error: 'HUBSPOT_NOT_CONFIGURED', message: 'Configura HUBSPOT_TOKEN en el servidor para sincronizar con HubSpot.' });
  }
  try {
    const remote = await fetchHubspotDeals();
    const vendedores = await prisma.vendedor.findMany();
    let created = 0, updated = 0;

    for (const rd of remote) {
      const dealOwner = vendedores.find((v) => v.nombre.toLowerCase() === (rd.dealOwnerLabel || '').toLowerCase());
      const existing = await prisma.crmDeal.findUnique({ where: { hubspotDealId: rd.hubspotDealId } });
      const data = {
        cliente: rd.cliente, negocio: rd.negocio, etapa: rd.etapa, amount: rd.amount,
        hubspotOwnerId: rd.hubspotOwnerId, dealOwnerLabel: rd.dealOwnerLabel,
        dealOwnerId: dealOwner?.id, serviceOwner: rd.serviceOwner,
        hubspotCompanyId: rd.hubspotCompanyId, source: 'hubspot' as const, lastSyncedAt: new Date(),
      };
      if (existing) {
        await prisma.crmDeal.update({ where: { id: existing.id }, data });
        updated++;
      } else {
        await prisma.crmDeal.create({ data: { ...data, hubspotDealId: rd.hubspotDealId } });
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
  const existing = await prisma.crmDeal.findUnique({ where: { id: req.params.id } });
  if (!existing) return res.status(404).json({ error: 'not_found' });

  const data: any = {};
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
        const vendedor = await prisma.vendedor.findUnique({ where: { id: dealOwnerId } });
        const owners = await listHubspotOwners();
        hubspotOwnerId = owners.find((o) => o.email.toLowerCase() === (vendedor?.email || '').toLowerCase())?.id;
      }
      await updateHubspotDeal(existing.hubspotDealId, { etapa, amount, hubspotOwnerId, serviceOwner });
    } catch (err: any) {
      hubspotWarning = `Se guardó localmente, pero no se pudo actualizar HubSpot: ${err?.message}`;
    }
  }

  const updated = await prisma.crmDeal.update({ where: { id: req.params.id }, data, include: { producto: true, dealOwner: true } });
  res.json({ ...shape(updated), hubspotWarning });
});

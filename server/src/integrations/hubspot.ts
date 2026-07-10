/**
 * Real integration with HubSpot's CRM API (v3). Docs: https://developers.hubspot.com/docs/api/crm/deals
 *
 * Requires a Private App token in HUBSPOT_TOKEN with scopes:
 *   crm.objects.deals.read, crm.objects.deals.write,
 *   crm.objects.companies.read, crm.objects.owners.read
 * and HUBSPOT_PORTAL_ID for building real "open in HubSpot" deep links.
 */

const HUBSPOT_BASE = 'https://api.hubapi.com';
const SERVICE_OWNER_PROPERTY = 'aviva_service_owner';

export const DEAL_STAGE_LABELS = [
  'Documentos subidos',
  'Documentos verificados',
  'Aprobado',
  'Contrato enviado',
  'Desembolso',
  'Rechazado',
] as const;

export function isHubspotConfigured(): boolean {
  return !!process.env.HUBSPOT_TOKEN;
}

export function hubspotPortalId(): string | undefined {
  return process.env.HUBSPOT_PORTAL_ID;
}

function authHeaders() {
  const token = process.env.HUBSPOT_TOKEN;
  if (!token) throw new Error('HUBSPOT_NOT_CONFIGURED');
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function hsFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, { ...init, headers: { ...authHeaders(), ...(init?.headers || {}) } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HubSpot respondió ${res.status}: ${body.slice(0, 300)}`);
  }
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

interface HubspotPipelineStage { id: string; label: string; }
interface HubspotPipeline { id: string; label: string; stages: HubspotPipelineStage[]; }

let stageCache: { pipelineId: string; byLabel: Map<string, string>; byId: Map<string, string> } | null = null;

async function loadDealPipeline() {
  if (stageCache) return stageCache;
  const data = await hsFetch<{ results: HubspotPipeline[] }>('/crm/v3/pipelines/deals');
  const pipeline = data.results[0];
  const byLabel = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const stage of pipeline?.stages || []) {
    byLabel.set(stage.label.toLowerCase(), stage.id);
    byId.set(stage.id, stage.label);
  }
  stageCache = { pipelineId: pipeline?.id, byLabel, byId };
  return stageCache;
}

async function ensureServiceOwnerProperty() {
  try {
    await hsFetch(`/crm/v3/properties/deals/${SERVICE_OWNER_PROPERTY}`);
  } catch {
    // property missing — create it (best effort; ignore failure if it already exists / no perms)
    try {
      await hsFetch('/crm/v3/properties/deals', {
        method: 'POST',
        body: JSON.stringify({
          name: SERVICE_OWNER_PROPERTY,
          label: 'Service owner',
          type: 'string',
          fieldType: 'text',
          groupName: 'dealinformation',
        }),
      });
    } catch {
      // ignore — updates will just skip this field if it truly can't be created
    }
  }
}

interface HubspotDealResult {
  id: string;
  properties: Record<string, string | null>;
  associations?: { companies?: { results: { id: string }[] } };
}

interface HubspotOwner { id: string; email: string; firstName?: string; lastName?: string; }

export interface HubspotDealDTO {
  hubspotDealId: string;
  cliente: string;
  negocio: string;
  etapa: string;
  amount: number | null;
  hubspotOwnerId: string | null;
  dealOwnerLabel: string | null;
  serviceOwner: string | null;
  hubspotCompanyId: string | null;
}

export async function fetchHubspotDeals(limit = 100): Promise<HubspotDealDTO[]> {
  await ensureServiceOwnerProperty();
  const { byId } = await loadDealPipeline();

  const owners = await hsFetch<{ results: HubspotOwner[] }>(`/crm/v3/owners?limit=200`);
  const ownerById = new Map(owners.results.map((o) => [o.id, [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email]));

  const properties = ['dealname', 'amount', 'dealstage', 'hubspot_owner_id', SERVICE_OWNER_PROPERTY].join(',');
  const deals = await hsFetch<{ results: HubspotDealResult[] }>(
    `/crm/v3/objects/deals?limit=${limit}&properties=${properties}&associations=companies`,
  );

  const companyIds = deals.results
    .flatMap((d) => d.associations?.companies?.results?.map((c) => c.id) || [])
    .filter(Boolean);
  const companyNameById = new Map<string, string>();
  if (companyIds.length) {
    const batch = await hsFetch<{ results: { id: string; properties: { name?: string } }[] }>(
      '/crm/v3/objects/companies/batch/read',
      { method: 'POST', body: JSON.stringify({ properties: ['name'], inputs: companyIds.map((id) => ({ id })) }) },
    );
    for (const c of batch.results) companyNameById.set(c.id, c.properties.name || '');
  }

  return deals.results.map((d) => {
    const companyId = d.associations?.companies?.results?.[0]?.id || null;
    const stageId = d.properties.dealstage || '';
    return {
      hubspotDealId: d.id,
      cliente: d.properties.dealname || 'Sin nombre',
      negocio: companyId ? companyNameById.get(companyId) || '' : '',
      etapa: byId.get(stageId) || stageId || 'Documentos subidos',
      amount: d.properties.amount ? Number(d.properties.amount) : null,
      hubspotOwnerId: d.properties.hubspot_owner_id || null,
      dealOwnerLabel: d.properties.hubspot_owner_id ? ownerById.get(d.properties.hubspot_owner_id) || null : null,
      serviceOwner: d.properties[SERVICE_OWNER_PROPERTY] || null,
      hubspotCompanyId: companyId,
    };
  });
}

export async function listHubspotOwners(): Promise<{ id: string; nombre: string; email: string }[]> {
  const owners = await hsFetch<{ results: HubspotOwner[] }>(`/crm/v3/owners?limit=200`);
  return owners.results.map((o) => ({ id: o.id, nombre: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email, email: o.email }));
}

export async function updateHubspotDeal(
  hubspotDealId: string,
  updates: { etapa?: string; amount?: number; hubspotOwnerId?: string; serviceOwner?: string },
): Promise<void> {
  await ensureServiceOwnerProperty();
  const { byLabel } = await loadDealPipeline();
  const properties: Record<string, string> = {};
  if (updates.etapa) {
    const stageId = byLabel.get(updates.etapa.toLowerCase());
    if (stageId) properties.dealstage = stageId;
  }
  if (updates.amount != null) properties.amount = String(updates.amount);
  if (updates.hubspotOwnerId) properties.hubspot_owner_id = updates.hubspotOwnerId;
  if (updates.serviceOwner != null) properties[SERVICE_OWNER_PROPERTY] = updates.serviceOwner;

  if (Object.keys(properties).length === 0) return;

  await hsFetch(`/crm/v3/objects/deals/${hubspotDealId}`, {
    method: 'PATCH',
    body: JSON.stringify({ properties }),
  });
}

export function hubspotDealUrl(hubspotDealId: string): string | null {
  const portalId = hubspotPortalId();
  if (!portalId) return null;
  return `https://app.hubspot.com/contacts/${portalId}/deal/${hubspotDealId}`;
}

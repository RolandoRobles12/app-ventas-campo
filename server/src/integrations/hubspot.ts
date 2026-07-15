/**
 * Real integration with HubSpot's CRM API (v3). Docs: https://developers.hubspot.com/docs/api/crm/deals
 *
 * Requires a Private App token in HUBSPOT_TOKEN with scopes:
 *   crm.objects.deals.read, crm.objects.deals.write,
 *   crm.objects.companies.read, crm.objects.owners.read,
 *   crm.schemas.deals.read, crm.schemas.deals.write (para crear/leer la propiedad
 *   personalizada "aviva_service_owner" — sin este scope, el service owner
 *   nunca se guarda en HubSpot, aunque sí se guarde localmente)
 * y HUBSPOT_PORTAL_ID para construir enlaces "abrir en HubSpot".
 *
 * El pipeline de deals a usar se fija con HUBSPOT_PIPELINE_ID (recomendado si
 * la cuenta tiene más de un pipeline); si no se define, se usa el primero que
 * devuelva la API. Las 6 etapas de DEAL_STAGE_LABELS deben existir con ese
 * nombre exacto (sin distinguir mayúsculas) como stages de ese pipeline en
 * HubSpot — si no existen, los cambios de etapa se ignoran en silencio del
 * lado de HubSpot (updateHubspotDeal solo manda dealstage cuando encuentra
 * un match).
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
  const pipelineId = process.env.HUBSPOT_PIPELINE_ID;
  // Sin HUBSPOT_PIPELINE_ID, usamos el primer pipeline que devuelva la API —
  // correcto solo si la cuenta tiene un único pipeline de deals.
  const pipeline = pipelineId ? data.results.find((p) => p.id === pipelineId) : data.results[0];
  if (pipelineId && !pipeline) {
    throw new Error(`HUBSPOT_PIPELINE_ID="${pipelineId}" no coincide con ningún pipeline de deals en HubSpot`);
  }
  const byLabel = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const stage of pipeline?.stages || []) {
    byLabel.set(stage.label.toLowerCase(), stage.id);
    byId.set(stage.id, stage.label);
  }
  stageCache = { pipelineId: pipeline?.id ?? '', byLabel, byId };
  return stageCache;
}

export async function listDealPipelines(): Promise<{ id: string; label: string }[]> {
  const data = await hsFetch<{ results: HubspotPipeline[] }>('/crm/v3/pipelines/deals');
  return data.results.map((p) => ({ id: p.id, label: p.label }));
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

interface HubspotPage<T> { results: T[]; paging?: { next?: { after: string } } }

// Sigue paging.next.after hasta agotar el listado o llegar a maxPages (tope de
// seguridad: 50 páginas * 100 = 5,000 registros, de sobra para esta operación).
async function hsFetchAllPages<T>(basePath: string, maxPages = 50): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const sep = basePath.includes('?') ? '&' : '?';
    const path = after ? `${basePath}${sep}after=${encodeURIComponent(after)}` : basePath;
    const data = await hsFetch<HubspotPage<T>>(path);
    out.push(...data.results);
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export interface HubspotDealDTO {
  hubspotDealId: string;
  cliente: string;
  negocio: string;
  etapa: string;
  amount: number | null;
  hubspotOwnerId: string | null;
  dealOwnerLabel: string | null;
  dealOwnerEmail: string | null;
  serviceOwner: string | null;
  hubspotCompanyId: string | null;
}

export async function fetchHubspotDeals(): Promise<HubspotDealDTO[]> {
  await ensureServiceOwnerProperty();
  const { byId } = await loadDealPipeline();

  const owners = await hsFetchAllPages<HubspotOwner>('/crm/v3/owners?limit=100');
  const ownerById = new Map(owners.map((o) => [o.id, { nombre: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email, email: o.email }]));

  const properties = ['dealname', 'amount', 'dealstage', 'hubspot_owner_id', SERVICE_OWNER_PROPERTY].join(',');
  const deals = await hsFetchAllPages<HubspotDealResult>(
    `/crm/v3/objects/deals?limit=100&properties=${properties}&associations=companies`,
  );

  const companyIds = [...new Set(deals.flatMap((d) => d.associations?.companies?.results?.map((c) => c.id) || []).filter(Boolean))];
  const companyNameById = new Map<string, string>();
  for (const batchIds of chunk(companyIds, 100)) {
    const batch = await hsFetch<{ results: { id: string; properties: { name?: string } }[] }>(
      '/crm/v3/objects/companies/batch/read',
      { method: 'POST', body: JSON.stringify({ properties: ['name'], inputs: batchIds.map((id) => ({ id })) }) },
    );
    for (const c of batch.results) companyNameById.set(c.id, c.properties.name || '');
  }

  return deals.map((d) => {
    const companyId = d.associations?.companies?.results?.[0]?.id || null;
    const stageId = d.properties.dealstage || '';
    const owner = d.properties.hubspot_owner_id ? ownerById.get(d.properties.hubspot_owner_id) : undefined;
    return {
      hubspotDealId: d.id,
      cliente: d.properties.dealname || 'Sin nombre',
      negocio: companyId ? companyNameById.get(companyId) || '' : '',
      etapa: byId.get(stageId) || stageId || 'Documentos subidos',
      amount: d.properties.amount ? Number(d.properties.amount) : null,
      hubspotOwnerId: d.properties.hubspot_owner_id || null,
      dealOwnerLabel: owner?.nombre || null,
      dealOwnerEmail: owner?.email || null,
      serviceOwner: d.properties[SERVICE_OWNER_PROPERTY] || null,
      hubspotCompanyId: companyId,
    };
  });
}

export async function listHubspotOwners(): Promise<{ id: string; nombre: string; email: string }[]> {
  const owners = await hsFetchAllPages<HubspotOwner>('/crm/v3/owners?limit=100');
  return owners.map((o) => ({ id: o.id, nombre: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email, email: o.email }));
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
    // Si no hay match, no lo ignoramos en silencio: sin esto, el deal se
    // guardaba como "sincronizado" aunque la etapa nunca cambiara en HubSpot.
    if (!stageId) {
      throw new Error(`El pipeline de HubSpot no tiene una etapa llamada "${updates.etapa}" — revisa HUBSPOT_PIPELINE_ID y los nombres de sus stages`);
    }
    properties.dealstage = stageId;
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

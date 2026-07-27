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
 * El pipeline de deals a sincronizar ("Nuevas visitas") se detecta
 * automáticamente: se busca cuál pipeline de la cuenta contiene el stage
 * "Aprobado" con el id fijado en FUNNEL_STAGE_IDS. Solo se sincronizan deals
 * de ESE pipeline (vía /crm/v3/objects/deals/search filtrando por
 * `pipeline`), no todos los deals de la cuenta. Las 6 etapas de
 * DEAL_STAGE_LABELS deben existir con ese nombre exacto (sin distinguir
 * mayúsculas) como stages de ese pipeline en HubSpot — si no existen, los
 * cambios de etapa se ignoran en silencio del lado de HubSpot
 * (updateHubspotDeal solo manda dealstage cuando encuentra un match).
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

// Únicas 4 etapas que le interesan al funnel de "Prospectos" (los otros 2
// stages siguen existiendo como pasos intermedios del deal, pero no se
// cuentan en el resumen del funnel).
export const FUNNEL_STAGE_LABELS = ['Aprobado', 'Contrato enviado', 'Desembolso', 'Rechazado'] as const;

// IDs reales de HubSpot de esas 4 etapas, dentro del pipeline "Nuevas
// visitas". Se usan para (a) ubicar ese pipeline automáticamente sin
// depender de una env var, y (b) limitar la sincronización a él en vez de
// traer deals de toda la cuenta.
const FUNNEL_STAGE_IDS: Record<string, string> = {
  aprobado: '1341410960',
  'contrato enviado': '1341580182',
  desembolso: '1341580187',
  rechazado: '1341410959',
};

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
  const anchorStageId = FUNNEL_STAGE_IDS.aprobado;
  const pipeline = data.results.find((p) => p.stages.some((s) => s.id === anchorStageId));
  if (!pipeline) {
    throw new Error(
      `No se encontró ningún pipeline de deals en HubSpot con el stage "Aprobado" (id ${anchorStageId}). ` +
      'Revisa FUNNEL_STAGE_IDS en server/src/integrations/hubspot.ts contra GET /crm/pipelines.',
    );
  }
  const byLabel = new Map<string, string>();
  const byId = new Map<string, string>();
  for (const stage of pipeline.stages) {
    byLabel.set(stage.label.toLowerCase(), stage.id);
    byId.set(stage.id, stage.label);
  }
  stageCache = { pipelineId: pipeline.id, byLabel, byId };
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

// Igual que hsFetchAllPages, pero contra el endpoint de búsqueda (POST, con
// filtros) en vez del de listado plano — lo usamos para limitar la
// sincronización a un solo pipeline en vez de traer toda la cuenta.
async function hsSearchAllPages<T>(objectType: string, body: Record<string, unknown>, maxPages = 50): Promise<T[]> {
  const out: T[] = [];
  let after: string | undefined;
  for (let page = 0; page < maxPages; page++) {
    const data = await hsFetch<HubspotPage<T>>(`/crm/v3/objects/${objectType}/search`, {
      method: 'POST',
      body: JSON.stringify({ ...body, limit: 100, after }),
    });
    out.push(...data.results);
    after = data.paging?.next?.after;
    if (!after) break;
  }
  return out;
}

// El endpoint de búsqueda no soporta `associations` como el de listado, así
// que las compañías asociadas se resuelven aparte con la API de asociaciones.
async function fetchDealCompanyAssociations(dealIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  for (const batchIds of chunk(dealIds, 100)) {
    if (!batchIds.length) continue;
    const res = await hsFetch<{ results: { from: { id: string }; to: { toObjectId: string }[] }[] }>(
      '/crm/v4/associations/deals/companies/batch/read',
      { method: 'POST', body: JSON.stringify({ inputs: batchIds.map((id) => ({ id })) }) },
    );
    for (const r of res.results) {
      const companyId = r.to?.[0]?.toObjectId;
      if (companyId) map.set(r.from.id, String(companyId));
    }
  }
  return map;
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
  const { pipelineId, byId } = await loadDealPipeline();

  const owners = await hsFetchAllPages<HubspotOwner>('/crm/v3/owners?limit=100');
  const ownerById = new Map(owners.map((o) => [o.id, { nombre: [o.firstName, o.lastName].filter(Boolean).join(' ') || o.email, email: o.email }]));

  const properties = ['dealname', 'amount', 'dealstage', 'hubspot_owner_id', SERVICE_OWNER_PROPERTY];
  // Solo deals del pipeline de "Nuevas visitas" — antes se traían deals de
  // toda la cuenta de HubSpot sin filtrar por pipeline.
  const deals = await hsSearchAllPages<HubspotDealResult>('deals', {
    filterGroups: [{ filters: [{ propertyName: 'pipeline', operator: 'EQ', value: pipelineId }] }],
    properties,
  });

  const companyIdByDealId = await fetchDealCompanyAssociations(deals.map((d) => d.id));
  const companyIds = [...new Set(companyIdByDealId.values())];
  const companyNameById = new Map<string, string>();
  for (const batchIds of chunk(companyIds, 100)) {
    const batch = await hsFetch<{ results: { id: string; properties: { name?: string } }[] }>(
      '/crm/v3/objects/companies/batch/read',
      { method: 'POST', body: JSON.stringify({ properties: ['name'], inputs: batchIds.map((id) => ({ id })) }) },
    );
    for (const c of batch.results) companyNameById.set(c.id, c.properties.name || '');
  }

  return deals.map((d) => {
    const companyId = companyIdByDealId.get(d.id) || null;
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
      throw new Error(`El pipeline de "Nuevas visitas" en HubSpot no tiene una etapa llamada "${updates.etapa}" — revisa los nombres de sus stages`);
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

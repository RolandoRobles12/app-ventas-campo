// Lectura de solicitudes (deals) de HubSpot para el Tablero. Solo lee: no
// escribe nada en HubSpot ni guarda nada en Firestore.
//
// La integración anterior se apagó por costos (ago-2026): copiaba todos los
// deals a Firestore cada 30 min y consultaba HubSpot en cada carga de la
// pantalla del vendedor. Esta solo consulta cuando un admin abre el Tablero,
// trae únicamente los deals del pipeline de campo de los vendedores en el
// rango pedido, y guarda la respuesta en memoria unos minutos para que
// varias personas viendo el Tablero no repitan la consulta.
//
// Requiere HUBSPOT_TOKEN: token de una Private App con los scopes de lectura
// crm.objects.deals.read y crm.objects.owners.read.

const HUBSPOT_BASE = 'https://api.hubapi.com';

// Pipeline de las solicitudes de campo.
export const PIPELINE_CAMPO = process.env.HUBSPOT_PIPELINE_ID || '890269050';
// Propiedades de sistema de HubSpot: fecha en que el deal entró a la etapa
// "Aprobado" / "Rechazado" de ese pipeline (vacías si nunca entró).
const PROP_APROBADO = 'hs_v2_date_entered_1341410960';
const PROP_RECHAZADO = 'hs_v2_date_entered_1341410959';

const CACHE_DEALS_MS = 15 * 60 * 1000;
const CACHE_OWNERS_MS = 60 * 60 * 1000;
// El filtro IN de la búsqueda de HubSpot acepta hasta 100 valores.
const MAX_VALORES_IN = 100;
const PAGINA = 200;
// La búsqueda de HubSpot no deja paginar más allá de 10,000 resultados.
const MAX_RESULTADOS_BUSQUEDA = 10_000;

export function hubspotConfigurado(): boolean {
  return !!process.env.HUBSPOT_TOKEN;
}

async function hsFetch<T>(path: string, init?: RequestInit, intentos = 4): Promise<T> {
  for (let i = 0; i < intentos; i++) {
    const res = await fetch(`${HUBSPOT_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    // La búsqueda tiene un límite de peticiones por segundo más estricto que
    // el resto del API: un 429 ocasional se reintenta.
    if ((res.status === 429 || res.status >= 500) && i < intentos - 1) {
      const espera = res.status === 429 ? (Number(res.headers.get('Retry-After')) || 1) * 1000 : 2 ** i * 1000;
      await new Promise((r) => setTimeout(r, espera));
      continue;
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`HubSpot respondió ${res.status}: ${body.slice(0, 200)}`);
    }
    return (await res.json()) as T;
  }
  throw new Error('HubSpot: se agotaron los reintentos');
}

// ---- Owners (correo → id) ----

let ownersCache: { en: number; porEmail: Map<string, string> } | null = null;

export async function ownersPorEmail(): Promise<Map<string, string>> {
  if (ownersCache && Date.now() - ownersCache.en < CACHE_OWNERS_MS) return ownersCache.porEmail;
  const porEmail = new Map<string, string>();
  let after: string | undefined;
  do {
    const r = await hsFetch<{ results: { id: string; email?: string }[]; paging?: { next?: { after: string } } }>(
      `/crm/v3/owners?limit=100${after ? `&after=${encodeURIComponent(after)}` : ''}`,
    );
    for (const o of r.results) if (o.email) porEmail.set(o.email.trim().toLowerCase(), o.id);
    after = r.paging?.next?.after;
  } while (after);
  ownersCache = { en: Date.now(), porEmail };
  return porEmail;
}

// ---- Deals ----

export interface DealCampo {
  id: string;
  ownerId: string;
  creado: number; // ms
  aprobado: number | null; // ms en que entró a "Aprobado"
  rechazado: number | null; // ms en que entró a "Rechazado"
}

const fechaMs = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

const dealsCache = new Map<string, { en: number; deals: Promise<DealCampo[]> }>();

async function buscarDeals(ownerIds: string[], desde: number, hasta: number): Promise<DealCampo[]> {
  const deals: DealCampo[] = [];
  for (let i = 0; i < ownerIds.length; i += MAX_VALORES_IN) {
    const bloque = ownerIds.slice(i, i + MAX_VALORES_IN);
    let after: string | undefined;
    let leidos = 0;
    do {
      const r = await hsFetch<{
        total: number;
        results: { id: string; properties: Record<string, string | null> }[];
        paging?: { next?: { after: string } };
      }>('/crm/v3/objects/deals/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [{
            filters: [
              { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_CAMPO },
              { propertyName: 'createdate', operator: 'GTE', value: String(desde) },
              { propertyName: 'createdate', operator: 'LT', value: String(hasta) },
              { propertyName: 'hubspot_owner_id', operator: 'IN', values: bloque },
            ],
          }],
          properties: ['createdate', 'hubspot_owner_id', PROP_APROBADO, PROP_RECHAZADO],
          sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }],
          limit: PAGINA,
          ...(after ? { after } : {}),
        }),
      });
      if (r.total > MAX_RESULTADOS_BUSQUEDA && desde < hasta - 1) {
        // Demasiados para una sola búsqueda: se parte el rango a la mitad.
        const mitad = Math.floor((desde + hasta) / 2);
        const [a, b] = await Promise.all([buscarDeals(bloque, desde, mitad), buscarDeals(bloque, mitad, hasta)]);
        deals.push(...a, ...b);
        after = undefined;
        break;
      }
      for (const d of r.results) {
        const creado = fechaMs(d.properties.createdate);
        const ownerId = d.properties.hubspot_owner_id;
        if (creado == null || !ownerId) continue;
        deals.push({ id: d.id, ownerId, creado, aprobado: fechaMs(d.properties[PROP_APROBADO]), rechazado: fechaMs(d.properties[PROP_RECHAZADO]) });
      }
      leidos += r.results.length;
      after = r.paging?.next?.after;
    } while (after && leidos < MAX_RESULTADOS_BUSQUEDA);
  }
  return deals;
}

// Deals del pipeline de campo de esos owners creados en [desde, hasta).
export async function dealsDeCampo(ownerIds: string[], desde: Date, hasta: Date): Promise<DealCampo[]> {
  if (!ownerIds.length) return [];
  const ids = [...new Set(ownerIds)].sort();
  // El rango se redondea al minuto para que dos aperturas seguidas del
  // Tablero reutilicen la misma consulta.
  const d = Math.floor(desde.getTime() / 60_000) * 60_000;
  const h = Math.ceil(hasta.getTime() / 60_000) * 60_000;
  const llave = `${ids.join(',')}|${d}|${h}`;
  const ahora = Date.now();
  for (const [k, v] of dealsCache) if (ahora - v.en > CACHE_DEALS_MS) dealsCache.delete(k);
  const enCache = dealsCache.get(llave);
  if (enCache) return enCache.deals;
  const deals = buscarDeals(ids, d, h);
  dealsCache.set(llave, { en: ahora, deals });
  // Una consulta que falla no se queda en la caché.
  deals.catch(() => dealsCache.delete(llave));
  return deals;
}

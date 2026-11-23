// Lectura de solicitudes (deals) de HubSpot para el Tablero. Solo lee: no
// escribe nada en HubSpot ni guarda nada en Firestore.
//
// La integración anterior se apagó por costos (ago-2026): copiaba todos los
// deals a Firestore cada 30 min y consultaba HubSpot en cada carga de la
// pantalla del vendedor. Esta solo consulta cuando un admin abre el Tablero,
// trae únicamente los deals del pipeline de campo de los meses que toca el
// periodo, y guarda cada mes en memoria unos minutos para que varias
// personas (y varias vistas o filtros) no repitan la consulta.
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
// Fecha en que entró a la etapa "Desembolsado".
const PROP_DESEMBOLSADO = 'hs_v2_date_entered_1341580187';
// Monto del deal (el "Importe" estándar de HubSpot, salvo que se configure otra propiedad).
const PROP_MONTO = process.env.HUBSPOT_PROP_MONTO || 'amount';

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

// La búsqueda (/search) de HubSpot admite pocas peticiones por segundo por
// cuenta (y la cuenta la comparten otras integraciones). Todas las
// búsquedas de este servidor pasan por un turno: se separan al menos
// ESPACIO_BUSQUEDA_MS aunque se pidan a la vez (varios meses, varias
// páginas, la app del vendedor ligando solicitudes).
const ESPACIO_BUSQUEDA_MS = 350;
let siguienteBusqueda = 0;
const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function turnoBusqueda(): Promise<void> {
  const ahora = Date.now();
  const t = Math.max(ahora, siguienteBusqueda);
  siguienteBusqueda = t + ESPACIO_BUSQUEDA_MS;
  if (t > ahora) await dormir(t - ahora);
}

async function hsFetch<T>(path: string, init?: RequestInit, intentos = 6): Promise<T> {
  const esBusqueda = path.endsWith('/search');
  for (let i = 0; i < intentos; i++) {
    if (esBusqueda) await turnoBusqueda();
    const res = await fetch(`${HUBSPOT_BASE}${path}`, {
      ...init,
      headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, 'Content-Type': 'application/json', ...(init?.headers || {}) },
    });
    // Límite por segundo (429) o falla temporal: se espera cada vez más, con
    // un poco de azar para que los reintentos no vuelvan a llegar juntos.
    if ((res.status === 429 || res.status >= 500) && i < intentos - 1) {
      const retryAfter = Number(res.headers.get('Retry-After'));
      const espera = (retryAfter > 0 ? retryAfter * 1000 : Math.min(1000 * 2 ** i, 8000)) + Math.random() * 500;
      // Un 429 frena también las demás búsquedas en curso, no solo esta.
      if (res.status === 429 && esBusqueda) siguienteBusqueda = Math.max(siguienteBusqueda, Date.now() + espera);
      await dormir(espera);
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
  desembolsado: number | null; // ms en que entró a "Desembolsado"
  monto: number | null;
}

const numero = (v: string | null | undefined): number | null => {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const etapas = (p: Record<string, string | null>) => ({
  aprobado: fechaMs(p[PROP_APROBADO]), rechazado: fechaMs(p[PROP_RECHAZADO]),
  desembolsado: fechaMs(p[PROP_DESEMBOLSADO]), monto: numero(p[PROP_MONTO]),
});

const fechaMs = (v: string | null | undefined): number | null => {
  if (!v) return null;
  const n = Date.parse(v);
  return Number.isFinite(n) ? n : null;
};

// Busca deals del pipeline de campo creados en [desde, hasta). Con
// ownerIds = null trae los de todos los owners del pipeline.
async function buscarDeals(ownerIds: string[] | null, desde: number, hasta: number): Promise<DealCampo[]> {
  const deals: DealCampo[] = [];
  const bloques: (string[] | null)[] = [];
  if (ownerIds) for (let i = 0; i < ownerIds.length; i += MAX_VALORES_IN) bloques.push(ownerIds.slice(i, i + MAX_VALORES_IN));
  else bloques.push(null);
  for (const bloque of bloques) {
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
              ...(bloque ? [{ propertyName: 'hubspot_owner_id', operator: 'IN', values: bloque }] : []),
            ],
          }],
          properties: ['createdate', 'hubspot_owner_id', PROP_APROBADO, PROP_RECHAZADO, PROP_DESEMBOLSADO, PROP_MONTO],
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
        deals.push({ id: d.id, ownerId, creado, ...etapas(d.properties) });
      }
      leidos += r.results.length;
      after = r.paging?.next?.after;
    } while (after && leidos < MAX_RESULTADOS_BUSQUEDA);
  }
  return deals;
}

// Caché por mes de calendario (UTC), con los deals de todo el pipeline de
// campo. Antes la llave era "estos owners + este rango exacto": el rango de
// un periodo en curso termina "ahora" y cambiaba cada minuto, y cada filtro
// de producto o vendedor pedía otra búsqueda, así que casi nunca se
// reutilizaba y cada apertura del Tablero esperaba a HubSpot. Así, el mes
// de hoy y los anteriores se consultan una vez cada 15 min y todas las
// vistas y filtros salen de ahí (el filtro por owner y por fecha se hace en
// memoria).
const dealsPorMes = new Map<number, { en: number; deals: Promise<DealCampo[]> }>();
// Los meses se piden de dos en dos; de todos modos cada búsqueda espera su
// turno (turnoBusqueda), así que esto no rebasa el límite por segundo.
const MESES_EN_PARALELO = 2;

const inicioMesUtc = (t: number) => { const d = new Date(t); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1); };
const mesSiguienteUtc = (inicio: number) => { const d = new Date(inicio); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1); };

function dealsDelMes(inicio: number): Promise<DealCampo[]> {
  const ahora = Date.now();
  const enCache = dealsPorMes.get(inicio);
  if (enCache && ahora - enCache.en < CACHE_DEALS_MS) return enCache.deals;
  const deals = buscarDeals(null, inicio, mesSiguienteUtc(inicio));
  dealsPorMes.set(inicio, { en: ahora, deals });
  // Una consulta que falla no se queda en la caché.
  deals.catch(() => { if (dealsPorMes.get(inicio)?.deals === deals) dealsPorMes.delete(inicio); });
  return deals;
}

async function enTandas<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let siguiente = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (siguiente < items.length) {
      const i = siguiente++;
      out[i] = await fn(items[i]);
    }
  }));
  return out;
}

// Deals del pipeline de campo de esos owners creados en [desde, hasta).
export async function dealsDeCampo(ownerIds: string[], desde: Date, hasta: Date): Promise<DealCampo[]> {
  if (!ownerIds.length) return [];
  const owners = new Set(ownerIds);
  const d = desde.getTime();
  const h = hasta.getTime();
  const ahora = Date.now();
  for (const [k, v] of dealsPorMes) if (ahora - v.en > CACHE_DEALS_MS) dealsPorMes.delete(k);
  const meses: number[] = [];
  for (let m = inicioMesUtc(d); m < h; m = mesSiguienteUtc(m)) meses.push(m);
  const porMes = await enTandas(meses, MESES_EN_PARALELO, dealsDelMes);
  return porMes.flat().filter((x) => owners.has(x.ownerId) && x.creado >= d && x.creado < h);
}

// ---- Solicitudes para ligar a una visita (app del vendedor) ----
//
// El vendedor elige, al registrar "Hizo solicitud", cuál de sus solicitudes
// de HubSpot es la de ese negocio. Aquí la caché es de segundos (no de 15
// min como en el Tablero): justo acaba de crearla y tiene que verla.

export interface SolicitudHubspot { id: string; nombre: string; creado: number; ownerId: string | null; pipeline: string | null }

const CACHE_LIGAR_MS = 20_000;
const ligarCache = new Map<string, { en: number; lista: Promise<SolicitudHubspot[]> }>();

const aSolicitud = (d: { id: string; properties: Record<string, string | null> }): SolicitudHubspot => ({
  id: d.id,
  nombre: (d.properties.dealname || '').trim() || `Solicitud ${d.id}`,
  creado: fechaMs(d.properties.createdate) ?? 0,
  ownerId: d.properties.hubspot_owner_id ?? null,
  pipeline: d.properties.pipeline ?? null,
});

// Solicitudes del pipeline de campo de un owner creadas en [desde, hasta),
// la más reciente primero. `fresco` se salta la caché (botón "Actualizar").
export function solicitudesDeOwner(ownerId: string, desde: number, hasta: number, fresco = false): Promise<SolicitudHubspot[]> {
  const llave = `${ownerId}|${desde}|${hasta}`;
  const enCache = ligarCache.get(llave);
  if (!fresco && enCache && Date.now() - enCache.en < CACHE_LIGAR_MS) return enCache.lista;
  const lista = hsFetch<{ results: { id: string; properties: Record<string, string | null> }[] }>('/crm/v3/objects/deals/search', {
    method: 'POST',
    body: JSON.stringify({
      filterGroups: [{
        filters: [
          { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_CAMPO },
          { propertyName: 'hubspot_owner_id', operator: 'EQ', value: ownerId },
          { propertyName: 'createdate', operator: 'GTE', value: String(desde) },
          { propertyName: 'createdate', operator: 'LT', value: String(hasta) },
        ],
      }],
      properties: ['dealname', 'createdate', 'hubspot_owner_id', 'pipeline'],
      sorts: [{ propertyName: 'createdate', direction: 'DESCENDING' }],
      limit: 100,
    }),
  }).then((r) => r.results.map(aSolicitud));
  ligarCache.set(llave, { en: Date.now(), lista });
  lista.catch(() => ligarCache.delete(llave));
  return lista;
}

// Deals por id (para el Tablero: una solicitud ligada a mano puede haberse
// creado fuera del rango que se consultó por fecha).
export async function dealsPorId(ids: string[]): Promise<(DealCampo & { nombre: string; pipeline: string | null })[]> {
  const out: (DealCampo & { nombre: string; pipeline: string | null })[] = [];
  const unicos = [...new Set(ids)];
  for (let i = 0; i < unicos.length; i += 100) {
    const r = await hsFetch<{ results: { id: string; properties: Record<string, string | null> }[] }>('/crm/v3/objects/deals/batch/read', {
      method: 'POST',
      body: JSON.stringify({
        properties: ['dealname', 'createdate', 'hubspot_owner_id', 'pipeline', PROP_APROBADO, PROP_RECHAZADO, PROP_DESEMBOLSADO, PROP_MONTO],
        inputs: unicos.slice(i, i + 100).map((id) => ({ id })),
      }),
    });
    for (const d of r.results) {
      const s = aSolicitud(d);
      out.push({
        id: s.id, ownerId: s.ownerId ?? '', creado: s.creado, nombre: s.nombre, pipeline: s.pipeline,
        ...etapas(d.properties),
      });
    }
  }
  return out;
}

// Solicitudes del pipeline de campo de varios owners creadas en [desde,
// hasta), con su nombre: para encontrar las que no tienen visita (el
// vendedor tipificó otra cosa). Sin caché: lo usa una función programada.
export async function solicitudesDeOwners(ownerIds: string[], desde: number, hasta: number): Promise<SolicitudHubspot[]> {
  const out: SolicitudHubspot[] = [];
  const ids = [...new Set(ownerIds)];
  for (let i = 0; i < ids.length; i += MAX_VALORES_IN) {
    let after: string | undefined;
    do {
      const r = await hsFetch<{ results: { id: string; properties: Record<string, string | null> }[]; paging?: { next?: { after: string } } }>('/crm/v3/objects/deals/search', {
        method: 'POST',
        body: JSON.stringify({
          filterGroups: [{
            filters: [
              { propertyName: 'pipeline', operator: 'EQ', value: PIPELINE_CAMPO },
              { propertyName: 'createdate', operator: 'GTE', value: String(desde) },
              { propertyName: 'createdate', operator: 'LT', value: String(hasta) },
              { propertyName: 'hubspot_owner_id', operator: 'IN', values: ids.slice(i, i + MAX_VALORES_IN) },
            ],
          }],
          properties: ['dealname', 'createdate', 'hubspot_owner_id', 'pipeline'],
          sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }],
          limit: PAGINA,
          ...(after ? { after } : {}),
        }),
      });
      out.push(...r.results.map(aSolicitud));
      after = r.paging?.next?.after;
    } while (after && out.length < MAX_RESULTADOS_BUSQUEDA);
  }
  return out;
}

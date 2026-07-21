import { getIdToken } from '@aviva/ui';

export interface Producto { id: string; nombre: string; esDeCampo: boolean; giros: string[]; }
export interface Vendedor {
  id: string; nombre: string; iniciales: string; color: string; email: string | null; estado: string;
  ciudad: string; colonia: string | null; drawZone: boolean; producto: string; productoId: string;
  giros: string[]; prospectosCount?: number;
}
export interface Prospecto {
  id: string; vendedorId: string; nombre: string; direccion: string; giro?: string | null;
  distanciaKm?: number | null; telefono?: string | null; origen: string; estado: string;
  lat?: number | null; lng?: number | null;
}
export interface DashboardSummary {
  visitasHoy: number; visitasAyerPct: number | null; porVisitar: number; conversion: number;
  vendedoresTotal: number; vendedoresActivos: number;
}
export interface WeekBar { day: string; val: number; }
export interface ResultadosDonut { total: number; items: { resultado: string; count: number; pct: number; color: string }[]; }
export interface ActividadVendedor { id: string; nombre: string; iniciales: string; color: string; producto: string; ciudad: string; hoy: number; estado: string; }
export interface MapaLeadsResponse {
  totales: { total: number; porVisitar: number; visitados: number; sincronizadosCrm: number };
  leads: { id: string; nombre: string; direccion: string; estado: string; lat: number; lng: number; vendedor: string; color: string }[];
}
export interface MapaCalorResponse {
  puntos: { lat: number; lng: number; peso: number }[];
  visitasTotales: number;
  visitasConUbicacion: number;
}
export interface SeguimientoItem {
  id: string; nombre: string; iniciales: string; color: string; producto: string; ciudad: string;
  inicio: string | null; estado: string; realizadas: number; pendientes: number; pct: number; km: number; ubicacionActual: string;
}
export interface ReportesSummary { visitasTotales: number; solicitudes: number; conversion: number; kmRecorridos: number; }
export interface ReporteVendedor { id: string; nombre: string; total: number; solicitudes: number; km: number; w1: string; w2: string; }
export interface Evidencia { id: string; nombre: string; resultado: string; fotoUrl: string; createdAt: string; }
export interface CrmDeal {
  id: string; hubspotDealId: string | null; cliente: string; negocio: string; producto?: string;
  etapa: string; amount: number | null; dealOwner: string | null; dealOwnerId: string | null;
  serviceOwner: string | null; source: string; lastSyncedAt: string | null; hubspotUrl: string | null;
}
export interface AvivaHrImportResult {
  ok: boolean; creados: number; actualizados: number; total: number;
  omitidos: { email: string; nombre: string; motivo: string }[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...authHeader, ...init?.headers } });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => ({})) : undefined;
  if (!res.ok) {
    const err: any = new Error(body?.message || body?.error || `Error ${res.status}`);
    err.code = body?.error;
    throw err;
  }
  return body as T;
}

function qs(params: Record<string, string | undefined>): string {
  const filtered = Object.entries(params).filter(([, v]) => v);
  if (!filtered.length) return '';
  return '?' + new URLSearchParams(filtered as [string, string][]).toString();
}

export const api = {
  productos: () => req<Producto[]>('/productos/de-campo'),
  vendedores: (producto?: string) => req<Vendedor[]>(`/vendedores${qs({ producto })}`),
  actualizarRuta: (id: string, data: { productoId?: string; ciudad?: string; colonia?: string; giros?: string[]; drawZone?: boolean }) =>
    req<Vendedor>(`/vendedores/${id}/ruta`, { method: 'PUT', body: JSON.stringify(data) }),
  avivaHrStatus: () => req<{ configured: boolean }>('/vendedores/externos/status'),
  avivaHrImportar: () => req<AvivaHrImportResult>('/vendedores/importar', { method: 'POST' }),

  prospectos: (vendedorId: string) => req<Prospecto[]>(`/prospectos/vendedor/${vendedorId}`),
  bulkProspectos: (vendedorId: string, items: Partial<Prospecto>[]) =>
    req<{ creados: number; prospectos: Prospecto[] }>('/prospectos/bulk', { method: 'POST', body: JSON.stringify({ vendedorId, items }) }),
  eliminarProspecto: (id: string) => req<void>(`/prospectos/${id}`, { method: 'DELETE' }),

  denueStatus: () => req<{ configured: boolean }>('/denue/status'),
  consultarDenue: (data: {
    giros: string[]; cantidad: number;
    ciudad?: string; colonia?: string;
    lat?: number; lng?: number; radioMetros?: number;
  }) => req<{ resultados: any[] }>('/denue/consulta', { method: 'POST', body: JSON.stringify(data) }),

  dashboardSummary: (producto?: string, vendedor?: string) => req<DashboardSummary>(`/dashboard/summary${qs({ producto, vendedor })}`),
  dashboardSemana: (producto?: string, vendedor?: string) => req<WeekBar[]>(`/dashboard/semana${qs({ producto, vendedor })}`),
  dashboardResultados: (producto?: string, vendedor?: string) => req<ResultadosDonut>(`/dashboard/resultados${qs({ producto, vendedor })}`),
  dashboardActividad: (producto?: string, vendedor?: string) => req<ActividadVendedor[]>(`/dashboard/actividad${qs({ producto, vendedor })}`),

  mapaLeads: (producto?: string, vendedor?: string) => req<MapaLeadsResponse>(`/mapa/leads${qs({ producto, vendedor })}`),
  mapaCalor: (producto?: string, vendedor?: string, dias?: number) =>
    req<MapaCalorResponse>(`/mapa/calor${qs({ producto, vendedor, dias: dias ? String(dias) : undefined })}`),
  seguimiento: (producto?: string, vendedor?: string) => req<SeguimientoItem[]>(`/seguimiento${qs({ producto, vendedor })}`),

  reportesSummary: (producto?: string, vendedor?: string) => req<ReportesSummary>(`/reportes/summary${qs({ producto, vendedor })}`),
  reportesVendedores: (producto?: string, vendedor?: string) => req<ReporteVendedor[]>(`/reportes/vendedores${qs({ producto, vendedor })}`),
  reportesEvidencias: (producto?: string, vendedor?: string) => req<Evidencia[]>(`/reportes/evidencias${qs({ producto, vendedor })}`),

  crmStatus: () => req<{ configured: boolean; stages: string[] }>('/crm/status'),
  crmDeals: (producto?: string, vendedor?: string) => req<CrmDeal[]>(`/crm/deals${qs({ producto, vendedor })}`),
  crmSync: () => req<{ ok: boolean; created: number; updated: number; total: number }>('/crm/sync', { method: 'POST' }),
  crmUpdate: (id: string, data: Partial<{ cliente: string; negocio: string; etapa: string; amount: number; dealOwnerId: string; serviceOwner: string }>) =>
    req<CrmDeal & { hubspotWarning?: string }>(`/crm/deals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
};

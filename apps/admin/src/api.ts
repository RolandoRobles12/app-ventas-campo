import { getIdToken } from '@aviva/ui';

export interface Producto { id: string; nombre: string; esDeCampo: boolean; giros: string[]; }
export interface ZonaPunto { lat: number; lng: number }

export interface ZonaRuta {
  etiqueta: string;
  lat: number | null;
  lng: number | null;
  radioMetros: number;
  poligonos: ZonaPunto[][] | null;
}
export interface RutaConfig {
  zona: ZonaRuta;
  giros: string[];
  visitasPorDia: number;
  dias: number[];
  semanas: number;
}

export interface Vendedor {
  id: string; nombre: string; iniciales: string; color: string; email: string | null;
  estado: 'Activo' | 'Baja';
  producto: string; productoId: string; giros: string[];
  puesto: string | null; zona: string | null; tienda: string | null;
  hubManagerNombre: string | null; headNombre: string | null;
  fuente: string | null; bajaEn: string | null; bajaMotivo: string | null;
  rutaConfig: RutaConfig | null;
  rutaAnterior: { etiqueta: string; poligonos: ZonaPunto[][] | null } | null;
}

export interface Prospecto {
  id: string; vendedorId: string; nombre: string; direccion: string; giro?: string | null;
  distanciaKm?: number | null; telefono?: string | null; origen: string; estado: string;
  lat?: number | null; lng?: number | null;
  fechaPlan?: string | null; orden?: number | null; reagendado?: boolean;
  semanaInicio?: string | null; semanaHasta?: string | null;
}

export interface EstadoRuta {
  vendedorId: string; pendientes: number; conFecha: number; sinFecha: number; atrasadas: number; hoy: number;
  hasta: string | null; diasRestantes: number | null; tieneConfig: boolean; zona: string | null; visitasPorDia: number | null;
}

export interface ItemRuta {
  nombre: string; direccion: string; giro?: string | null; telefono?: string | null;
  lat?: number | null; lng?: number | null; distanciaKm?: number | null;
  fechaPlan: string; orden: number; manual?: boolean;
}
export interface RutaGenerada {
  items: ItemRuta[]; fechas: string[]; necesarios: number; encontrados: number;
  centro: ZonaPunto; radioMetros: number;
}

export interface ReporteSync {
  ok: boolean; fecha: string; origen: 'manual' | 'programada'; actor: string | null;
  totalColaboradores: number; enProductosCampo: number;
  altas: { nombre: string; producto: string }[];
  bajas: { nombre: string; motivo: string }[];
  reactivados: { nombre: string }[];
  actualizados: number; sinColaborador: number; detenido: string | null;
}
export interface EstadoEquipo {
  configurado: boolean;
  productos: { id: string; nombre: string; esDeCampo: boolean; giros: string[] }[];
  girosDisponibles: string[];
  ultimo: ReporteSync | null;
}

export interface MetricasResumen {
  desde: string; hasta: string; porSemana: boolean; limitePlan: string;
  totales: {
    visitas: number; visitasPrev: number; cambioPct: number | null;
    planeados: number; cumplidos: number; cumplimiento: number | null;
    promedioDia: number; ubicacionValida: number | null; validables: number;
    negociosNuevos: number; vendedoresActivos: number; vendedoresConVisitas: number;
  };
  serie: { fecha: string; visitas: number }[];
  resultados: { resultado: string; count: number }[];
  vendedores: {
    id: string; nombre: string; iniciales: string; color: string; producto: string; estado: string;
    visitas: number; diasActivos: number; promedioDia: number; planeados: number; cumplidos: number;
    cumplimiento: number | null; ubicacionValida: number | null; negociosNuevos: number; ultimaVisita: string | null;
  }[];
}

export interface EnVivoItem {
  id: string; nombre: string; iniciales: string; color: string; producto: string; zona: string | null;
  estado: 'en_ruta' | 'inactivo' | 'sin_actividad';
  ultimaSenal: string | null; posicion: ZonaPunto | null;
  visitasHoy: number; planHoy: number; planHoyVisitados: number;
  primeraVisita: string | null;
  ultimaVisita: { nombre: string; resultado: string; hora: string } | null;
}

export interface MapaCalorResponse {
  puntos: { lat: number; lng: number; peso: number }[];
  visitasTotales: number;
  visitasConUbicacion: number;
}
export interface RecorridoVendedor {
  vendedorId: string; nombre: string; color: string;
  puntos: { lat: number; lng: number; createdAt: string }[];
}
export interface VisitaListItem {
  id: string; vendedorId: string; vendedorNombre: string; producto: string;
  esNegocioNuevo: boolean; nombreNegocio: string; direccion: string; resultado: string;
  notas: string | null; fotos: string[]; lat: number | null; lng: number | null;
  ubicacionValida: boolean | null; distanciaValidacionMetros: number | null; createdAt: string;
}
export interface VisitasResponse { items: VisitaListItem[]; nextCursor: string | null }
export interface Usuario { email: string; nombre: string | null; createdAt: string }

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

// Admite arreglos (selección múltiple de producto/vendedor/resultado): se
// mandan separados por coma.
function qs(params: Record<string, string | string[] | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) { if (value.length) sp.set(key, value.join(',')); }
    else if (value) sp.set(key, value);
  }
  const str = sp.toString();
  return str ? `?${str}` : '';
}

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export interface Filtro { productoIds?: string[]; vendedorIds?: string[]; desde?: string | null; hasta?: string | null }

export const api = {
  me: () => req<{ email: string; isAdmin: boolean }>('/auth/me'),

  usuarios: () => req<Usuario[]>('/usuarios'),
  agregarUsuario: (data: { email: string; nombre?: string }) => req<Usuario>('/usuarios', post(data)),
  eliminarUsuario: (email: string) => req<void>(`/usuarios/${encodeURIComponent(email)}`, { method: 'DELETE' }),

  productos: () => req<Producto[]>('/productos/de-campo'),
  vendedores: () => req<Vendedor[]>('/vendedores'),
  vendedor: (id: string) => req<Vendedor>(`/vendedores/${id}`),

  equipo: () => req<EstadoEquipo>('/equipo'),
  sincronizarEquipo: (forzar = false) => req<ReporteSync>('/equipo/sincronizar', post({ forzar })),
  guardarProductosEquipo: (data: { productosCampo?: string[]; giros?: Record<string, string[]> }) =>
    req<EstadoEquipo>('/equipo/productos', { method: 'PUT', body: JSON.stringify(data) }),

  rutasStatus: () => req<{ denue: boolean; googleMaps: boolean }>('/rutas/status'),
  rutasEstado: (f: { productoIds?: string[]; vendedorIds?: string[] } = {}) =>
    req<{ hoy: string; items: EstadoRuta[] }>(`/rutas/estado${qs(f)}`),
  generarRuta: (vendedorId: string, data: { config: RutaConfig; inicio: string; reemplazarPendientes: boolean }) =>
    req<RutaGenerada>(`/rutas/${vendedorId}/generar`, post(data)),
  publicarRuta: (vendedorId: string, data: { config: RutaConfig; inicio: string; items: ItemRuta[]; reemplazarPendientes: boolean; centro?: ZonaPunto }) =>
    req<{ creados: number; eliminados: number; desde: string | null; hasta: string | null }>(`/rutas/${vendedorId}/publicar`, post(data)),
  renovarRuta: (vendedorId: string) =>
    req<{ creados: number; desde: string | null; hasta: string | null; necesarios: number; encontrados: number }>(`/rutas/${vendedorId}/renovar`, post()),
  reasignarPendientes: (vendedorId: string, aVendedorId: string) =>
    req<{ movidos: number }>(`/rutas/${vendedorId}/reasignar`, post({ aVendedorId })),

  prospectos: (vendedorId: string) => req<Prospecto[]>(`/prospectos/vendedor/${vendedorId}`),

  metricas: (f: Filtro) => req<MetricasResumen>(`/metricas/resumen${qs({ ...f })}`),
  enVivo: (f: { productoIds?: string[]; vendedorIds?: string[] }) => req<{ hoy: string; items: EnVivoItem[] }>(`/seguimiento${qs(f)}`),
  mapaCalor: (f: Filtro) => req<MapaCalorResponse>(`/mapa/calor${qs({ ...f })}`),
  recorridos: (f: Filtro) => req<RecorridoVendedor[]>(`/ubicaciones/recorrido${qs({ ...f })}`),

  visitas: (params: Filtro & { resultados?: string[]; cursor?: string; limit?: number }) =>
    req<VisitasResponse>(`/visitas${qs({
      vendedorIds: params.vendedorIds, productoIds: params.productoIds, resultados: params.resultados,
      desde: params.desde, hasta: params.hasta, cursor: params.cursor, limit: params.limit ? String(params.limit) : undefined,
    })}`),
};

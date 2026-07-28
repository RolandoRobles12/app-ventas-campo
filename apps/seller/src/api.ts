import { getIdToken } from '@aviva/ui';

export interface Vendedor {
  id: string;
  nombre: string;
  iniciales: string;
  color: string;
  producto: string;
  ciudad: string;
}

export interface Prospecto {
  id: string;
  vendedorId: string;
  nombre: string;
  direccion: string;
  giro?: string | null;
  distanciaKm?: number | null;
  telefono?: string | null;
  origen: string;
  estado: 'por_visitar' | 'visitado';
  lat?: number | null;
  lng?: number | null;
  // Ventana de visita planeada por el admin (ruta semanal/quincenal/mensual):
  // YYYY-MM-DD, ambos inclusive. null = sin programar (se puede visitar ya).
  semanaInicio?: string | null;
  semanaHasta?: string | null;
}

export interface Metas {
  solicitudesHoy: { actual: number; meta: number };
  colocacionMes: { actual: number; meta: number };
  racha: number;
}

// El servidor SÍ respondió pero rechazó la petición. Cualquier otro error de
// req() (fetch que truena, token que no se pudo refrescar) se trata como
// "sin red" — es la señal que usa offline.ts para encolar en vez de perder datos.
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body instanceof FormData
      ? { ...authHeader, ...init.headers }
      : { 'Content-Type': 'application/json', ...authHeader, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || body.error || `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  me: () => req<{ email: string; vendedor: Vendedor | null }>('/auth/me'),
  prospectos: (vendedorId: string) => req<Prospecto[]>(`/prospectos/vendedor/${vendedorId}`),
  crearProspectoManual: (data: { vendedorId: string; nombre: string; direccion: string; giro?: string }) =>
    req<Prospecto>('/prospectos', { method: 'POST', body: JSON.stringify(data) }),
  metasHoy: (vendedorId: string) => req<Metas>(`/metas/${vendedorId}/hoy`),
  registrarVisita: (formData: FormData) =>
    req<{ id: string }>('/visitas', { method: 'POST', body: formData }),
  registrarUbicacion: (data: { vendedorId: string; lat: number; lng: number; accuracy?: number; capturadoEn?: number }) =>
    req<{ ok: boolean }>('/ubicaciones', { method: 'POST', body: JSON.stringify(data) }),
};

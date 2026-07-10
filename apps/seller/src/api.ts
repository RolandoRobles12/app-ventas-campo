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
}

export interface Metas {
  solicitudesHoy: { actual: number; meta: number };
  colocacionMes: { actual: number; meta: number };
}

export interface JornadaHoy {
  id: string;
  fecha: string;
  horaEntrada: string | null;
  horaSalidaComer: string | null;
  horaRegreso: string | null;
  horaSalida: string | null;
  activa: boolean;
  visitasHoy: number;
  racha: number;
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || body.error || `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  vendedoresDeCampo: () => req<Vendedor[]>('/vendedores').then((vs) => vs),
  prospectos: (vendedorId: string) => req<Prospecto[]>(`/prospectos/vendedor/${vendedorId}`),
  crearProspectoManual: (data: { vendedorId: string; nombre: string; direccion: string; giro?: string }) =>
    req<Prospecto>('/prospectos', { method: 'POST', body: JSON.stringify(data) }),
  metasHoy: (vendedorId: string) => req<Metas>(`/metas/${vendedorId}/hoy`),
  jornadaHoy: (vendedorId: string) => req<JornadaHoy>(`/jornada/${vendedorId}/hoy`),
  toggleJornada: (vendedorId: string) => req<JornadaHoy>(`/jornada/${vendedorId}/toggle`, { method: 'POST' }),
  registrarVisita: (formData: FormData) =>
    req<{ id: string }>('/visitas', { method: 'POST', body: formData }),
};

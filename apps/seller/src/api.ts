import { getIdToken } from '@aviva/ui';

export interface Vendedor {
  id: string;
  nombre: string;
  iniciales: string;
  color: string;
  producto: string;
  zona: string | null;
  rutaConfig: { visitasPorDia: number; dias: number[]; zona: { etiqueta: string } } | null;
  // Cuándo vio el recorrido de bienvenida (null: todavía no).
  onboardingVisto?: string | null;
}

export interface Prospecto {
  id: string;
  vendedorId: string;
  // El mismo negocio en cualquier ruta (de este u otro vendedor).
  negocioId?: string;
  nombre: string;
  direccion: string;
  giro?: string | null;
  distanciaKm?: number | null;
  telefono?: string | null;
  origen: string;
  estado: 'por_visitar' | 'visitado';
  lat?: number | null;
  lng?: number | null;
  // Día en que le toca (YYYY-MM-DD) y número de parada ese día; los pone el
  // planeador de rutas del admin. null en listas viejas sin fecha.
  fechaPlan?: string | null;
  orden?: number | null;
  reagendado?: boolean;
  // Cita agendada por teléfono: vale solo si citaFecha === fechaPlan.
  citaFecha?: string | null;
  citaHora?: string | null;
  ultimaLlamada?: { resultado: ResultadoLlamada; en: string } | null;
  // El vendedor reportó que el número no es del negocio.
  telefonoInvalido?: boolean;
  visitadoEn?: string | null;
  // Ventana semanal de rutas viejas (antes de fechaPlan).
  semanaInicio?: string | null;
  semanaHasta?: string | null;
}

export type ResultadoLlamada = 'cita' | 'llamar_despues' | 'no_contesto' | 'no_interesa' | 'numero_equivocado';

export interface NuevaLlamada {
  vendedorId: string;
  prospectoId: string;
  resultado: ResultadoLlamada;
  citaFecha?: string;
  citaHora?: string;
  telefonoNuevo?: string;
  notas?: string;
  capturadoEn: number;
}

export interface VisitaReciente {
  id: string;
  prospectoId: string | null;
  nombreNegocio: string;
  direccion: string;
  resultado: string;
  notas: string | null;
  fotos: number;
  esNegocioNuevo: boolean;
  ubicacionValida: boolean | null;
  createdAt: string;
}

// Una visita anterior al mismo negocio, de este vendedor o de otro.
export interface Antecedente {
  fecha: string | null;
  resultado: string;
  notas: string | null;
  vendedorNombre: string;
  propia: boolean;
}

export interface Progreso {
  hoy: string;
  visitasHoy: number;
  visitasPorDia: number | null;
  racha: number;
  semana: { fecha: string; visitas: number }[];
  recientes: VisitaReciente[];
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
    headers: { 'Content-Type': 'application/json', ...authHeader, ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.message || body.error || `Error ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export const api = {
  me: () => req<{ email: string; vendedor: Vendedor | null; baja: boolean }>('/auth/me'),
  prospectos: (vendedorId: string) => req<Prospecto[]>(`/prospectos/vendedor/${vendedorId}`),
  progreso: (vendedorId: string) => req<Progreso>(`/progreso/${vendedorId}`),
  antecedentes: (vendedorId: string, prospectoIds: string[]) =>
    req<Record<string, Antecedente[]>>(`/prospectos/vendedor/${vendedorId}/antecedentes?ids=${prospectoIds.map(encodeURIComponent).join(',')}`),
  registrarVisita: (data: Record<string, unknown>) =>
    req<{ id: string }>('/visitas', { method: 'POST', body: JSON.stringify(data) }),
  registrarLlamada: (data: NuevaLlamada) =>
    req<{ id: string }>('/llamadas', { method: 'POST', body: JSON.stringify(data) }),
  marcarOnboarding: () => req<void>('/auth/onboarding', { method: 'POST' }),
  registrarUbicacion: (data: { vendedorId: string; lat: number; lng: number; accuracy?: number; capturadoEn?: number }) =>
    req<{ ok: boolean }>('/ubicaciones', { method: 'POST', body: JSON.stringify(data) }),
};

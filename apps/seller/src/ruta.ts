import type { Prospecto } from './api';
import { fechaLocal } from './fechas';

export interface Posicion { lat: number; lng: number; accuracy: number }

export interface Parada extends Prospecto {
  // Metros desde donde está el vendedor ahora (null sin GPS o sin coordenadas).
  distanciaM: number | null;
  atrasada: boolean;
}

export function distanciaMetros(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function textoDistancia(m: number | null | undefined): string | null {
  if (m == null) return null;
  if (m < 1000) return `${Math.max(10, Math.round(m / 10) * 10)} m`;
  return `${(m / 1000).toFixed(m < 10000 ? 1 : 0)} km`;
}

export function comoLlegarUrl(p: { lat?: number | null; lng?: number | null; direccion: string }): string {
  const destino = p.lat != null && p.lng != null ? `${p.lat},${p.lng}` : encodeURIComponent(p.direccion);
  return `https://www.google.com/maps/dir/?api=1&destination=${destino}`;
}

// Hora de la cita agendada por teléfono ("HH:MM"), si sigue vigente: si el
// negocio se movió a otro día después de agendarla, ya no aplica.
export function horaCita(p: Prospecto): string | null {
  return p.citaHora && p.citaFecha && p.citaFecha === p.fechaPlan ? p.citaHora : null;
}

// "14:30" → "2:30 pm".
export function textoHora(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

const minutosDelDia = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

export function conDistancia(p: Prospecto, pos: Posicion | null, hoy = fechaLocal()): Parada {
  return {
    ...p,
    distanciaM: pos && p.lat != null && p.lng != null ? distanciaMetros(pos, { lat: p.lat, lng: p.lng }) : null,
    atrasada: !!p.fechaPlan && p.fechaPlan < hoy,
  };
}

export function porCercania(a: Parada, b: Parada): number {
  if (a.distanciaM != null && b.distanciaM != null) return a.distanciaM - b.distanciaM;
  if (a.distanciaM != null) return -1;
  if (b.distanciaM != null) return 1;
  return (a.fechaPlan ?? '').localeCompare(b.fechaPlan ?? '') || (a.orden ?? 0) - (b.orden ?? 0);
}

export interface RutaAgrupada {
  // Citas de hoy (agendadas por teléfono), por hora.
  citasHoy: Parada[];
  // Lo demás que toca hoy más lo atrasado, la más cercana primero.
  hoy: Parada[];
  // Pendientes sin día asignado (listas de antes del planeador por días).
  sinFecha: Parada[];
  visitadasHoy: Prospecto[];
  // Días siguientes, en orden.
  proximos: { fecha: string; paradas: Parada[] }[];
  // Cuántos negocios planeó el admin para hoy (visitados o no): la meta del día.
  planeadosHoy: number;
}

export function agruparRuta(lista: Prospecto[], pos: Posicion | null, hoy = fechaLocal()): RutaAgrupada {
  const pendientes = lista.filter((p) => p.estado === 'por_visitar').map((p) => conDistancia(p, pos, hoy));
  const esCitaHoy = (p: Parada) => p.fechaPlan === hoy && !!horaCita(p);
  const citasHoy = pendientes.filter(esCitaHoy).sort((a, b) => horaCita(a)!.localeCompare(horaCita(b)!));
  const hoyLista = pendientes.filter((p) => p.fechaPlan && p.fechaPlan <= hoy && !esCitaHoy(p)).sort(porCercania);
  // Una ruta vieja por semanas solo se muestra cuando ya empezó su semana.
  const sinFecha = pendientes.filter((p) => !p.fechaPlan && (!p.semanaInicio || p.semanaInicio <= hoy)).sort(porCercania);

  const futuros = new Map<string, Parada[]>();
  for (const p of pendientes) {
    const fecha = p.fechaPlan && p.fechaPlan > hoy ? p.fechaPlan : !p.fechaPlan && p.semanaInicio && p.semanaInicio > hoy ? p.semanaInicio : null;
    if (!fecha) continue;
    futuros.set(fecha, [...(futuros.get(fecha) ?? []), p]);
  }

  const visitadasHoy = lista.filter((p) => p.estado === 'visitado' && p.visitadoEn && fechaLocal(new Date(p.visitadoEn)) === hoy);

  return {
    citasHoy,
    hoy: hoyLista,
    sinFecha,
    visitadasHoy,
    proximos: [...futuros.entries()].sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, paradas]) => ({ fecha, paradas: paradas.sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)) })),
    planeadosHoy: lista.filter((p) => p.fechaPlan === hoy).length,
  };
}

// Una cita manda cuando falta una hora o menos (o ya pasó su hora); si no,
// la parada más cercana.
const MINUTOS_ANTES_DE_CITA = 60;

export function siguienteParada(r: RutaAgrupada, ahora = new Date()): Parada | undefined {
  const minutoActual = ahora.getHours() * 60 + ahora.getMinutes();
  const cita = r.citasHoy.find((c) => minutosDelDia(horaCita(c)!) - minutoActual <= MINUTOS_ANTES_DE_CITA);
  return cita ?? r.hoy[0] ?? r.citasHoy[0] ?? r.sinFecha[0];
}

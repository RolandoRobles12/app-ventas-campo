export type RangoPreset = 'hoy' | 'ayer' | '7d' | 'semana' | '30d' | 'mes' | 'todo' | 'personalizado';

export const RANGO_LABELS: Record<RangoPreset, string> = {
  hoy: 'Hoy', ayer: 'Ayer', '7d': 'Últimos 7 días', semana: 'Esta semana', '30d': 'Últimos 30 días',
  mes: 'Este mes', todo: 'Todo', personalizado: 'Personalizado',
};

export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return toISODate(d);
}

// getDay(): 0=domingo..6=sábado. "Esta semana" es lunes a domingo.
function lunesDeLaSemana(d: Date): Date {
  const date = new Date(d);
  const dow = date.getDay();
  date.setDate(date.getDate() + (dow === 0 ? -6 : 1 - dow));
  return date;
}

export interface Rango { desde: string; hasta: string }

// desde/hasta como YYYY-MM-DD, ambos inclusive. null = "todo" (sin filtro de fecha).
export function calcularRango(preset: RangoPreset, desdePersonalizado: string | null, hastaPersonalizado: string | null): Rango | null {
  const hoy = toISODate(new Date());
  switch (preset) {
    case 'todo': return null;
    case 'hoy': return { desde: hoy, hasta: hoy };
    case 'ayer': return { desde: sumarDias(hoy, -1), hasta: sumarDias(hoy, -1) };
    case '7d': return { desde: sumarDias(hoy, -6), hasta: hoy };
    case '30d': return { desde: sumarDias(hoy, -29), hasta: hoy };
    case 'semana': {
      const lunes = toISODate(lunesDeLaSemana(new Date()));
      return { desde: lunes, hasta: sumarDias(lunes, 6) };
    }
    case 'mes': {
      const h = new Date();
      return { desde: toISODate(new Date(h.getFullYear(), h.getMonth(), 1)), hasta: toISODate(new Date(h.getFullYear(), h.getMonth() + 1, 0)) };
    }
    default:
      return desdePersonalizado && hastaPersonalizado ? { desde: desdePersonalizado, hasta: hastaPersonalizado } : null;
  }
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

// "lun 3 nov" (con "Hoy"/"Mañana"/"Ayer" cuando aplica).
export function etiquetaDia(iso: string, conRelativo = true): string {
  const hoy = toISODate(new Date());
  if (conRelativo) {
    if (iso === hoy) return 'Hoy';
    if (iso === sumarDias(hoy, 1)) return 'Mañana';
    if (iso === sumarDias(hoy, -1)) return 'Ayer';
  }
  const d = new Date(`${iso}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

export function diaSemana(iso: string): number {
  return new Date(`${iso}T12:00:00`).getDay();
}

// "hace 5 min", "hace 2 h", "ayer 18:20"…
export function haceCuanto(isoInstante: string | null): string {
  if (!isoInstante) return '—';
  const ms = Date.now() - Date.parse(isoInstante);
  const min = Math.round(ms / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24 && toISODate(new Date(isoInstante)) === toISODate(new Date())) return `hace ${h} h`;
  const d = new Date(isoInstante);
  return `${etiquetaDia(toISODate(d))} ${d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })}`;
}

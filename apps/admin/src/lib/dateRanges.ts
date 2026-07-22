export type RangoPreset = 'todo' | 'hoy' | 'ayer' | 'semana' | 'mes' | 'personalizado';

export const RANGO_LABELS: Record<RangoPreset, string> = {
  todo: 'Todo', hoy: 'Hoy', ayer: 'Ayer', semana: 'Esta semana', mes: 'Este mes', personalizado: 'Personalizado',
};

function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// getDay(): 0=domingo..6=sábado. "Esta semana" es lunes a domingo.
function lunesDeLaSemana(d: Date): Date {
  const date = new Date(d);
  const dow = date.getDay();
  const diff = dow === 0 ? -6 : 1 - dow;
  date.setDate(date.getDate() + diff);
  return date;
}

export interface Rango { desde: string; hasta: string }

// desde/hasta como YYYY-MM-DD, ambos inclusive. null = "todo" (sin filtro de fecha).
export function calcularRango(preset: RangoPreset, desdePersonalizado: string | null, hastaPersonalizado: string | null): Rango | null {
  if (preset === 'todo') return null;
  const hoy = new Date();
  if (preset === 'hoy') {
    const iso = toISODate(hoy);
    return { desde: iso, hasta: iso };
  }
  if (preset === 'ayer') {
    const ayer = new Date(hoy);
    ayer.setDate(ayer.getDate() - 1);
    const iso = toISODate(ayer);
    return { desde: iso, hasta: iso };
  }
  if (preset === 'semana') {
    const lunes = lunesDeLaSemana(hoy);
    const domingo = new Date(lunes);
    domingo.setDate(domingo.getDate() + 6);
    return { desde: toISODate(lunes), hasta: toISODate(domingo) };
  }
  if (preset === 'mes') {
    const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
    return { desde: toISODate(primero), hasta: toISODate(ultimo) };
  }
  if (desdePersonalizado && hastaPersonalizado) return { desde: desdePersonalizado, hasta: hastaPersonalizado };
  return null;
}

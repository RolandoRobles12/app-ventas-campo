// Fechas de calendario en hora de México. Cloud Functions corre en UTC: sin
// esto, "hoy" cambiaría a las 6 de la tarde (hora del centro) y una visita
// de las 7pm se contaría en el día siguiente. Todas las fechas de plan
// (`fechaPlan`) y los filtros "desde/hasta" son YYYY-MM-DD en esta zona.

export const MX_TZ = 'America/Mexico_City';

// Convierte un año/mes/día/hora, interpretados en `timeZone`, al instante
// UTC real que representan.
function zonaAUtc(y: number, m: number, d: number, hh: number, mm: number, ss: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess);
  const get = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const comoSiUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(guess.getTime() - (comoSiUtc - guess.getTime()));
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

export function esFechaIso(s: unknown): s is string {
  if (typeof s !== 'string' || !ISO.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

// La fecha (YYYY-MM-DD) que tiene `instante` en la Ciudad de México.
export function fechaMx(instante: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: MX_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(instante);
}

export function hoyMx(): string {
  return fechaMx(new Date());
}

// Hora (0-23) actual en la Ciudad de México.
export function horaMx(): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: MX_TZ, hour: 'numeric', hourCycle: 'h23' }).format(new Date()));
}

// Instante UTC de las 00:00 de `iso` en la Ciudad de México.
export function inicioDiaMx(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return zonaAUtc(y, m, d, 0, 0, 0, MX_TZ);
}

// Aritmética pura de calendario (sin zona horaria de por medio).
export function sumarDias(iso: string, dias: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + dias));
  return date.toISOString().slice(0, 10);
}

// 0 = domingo … 6 = sábado.
export function diaSemana(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function diasEntre(desde: string, hasta: string): number {
  return Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);
}

// [inicio, fin) en instantes UTC para los días `desde`..`hasta` (ambos
// inclusive) de la Ciudad de México.
export function rangoMx(desde: string, hasta: string): { start: Date; end: Date } {
  return { start: inicioDiaMx(desde), end: inicioDiaMx(sumarDias(hasta, 1)) };
}

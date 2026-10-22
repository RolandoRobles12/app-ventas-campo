// Fechas de calendario del teléfono (YYYY-MM-DD). Ojo: toISOString() da la
// fecha en UTC, que en México cambia de día a las 6 de la tarde; por eso
// aquí siempre se arma con la fecha local.

export function fechaLocal(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function sumarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + dias);
  return fechaLocal(d);
}

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const DIAS_LARGOS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MESES_LARGOS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

// "Hoy", "Mañana", "Ayer" o "lun 3 nov".
export function etiquetaDia(iso: string, hoy = fechaLocal()): string {
  if (iso === hoy) return 'Hoy';
  if (iso === sumarDias(hoy, 1)) return 'Mañana';
  if (iso === sumarDias(hoy, -1)) return 'Ayer';
  const d = new Date(`${iso}T12:00:00`);
  return `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}`;
}

// "Miércoles 22 de octubre".
export function fechaLarga(d = new Date()): string {
  return `${DIAS_LARGOS[d.getDay()]} ${d.getDate()} de ${MESES_LARGOS[d.getMonth()]}`;
}

export function horaCorta(isoInstante: string | number): string {
  return new Date(isoInstante).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' });
}

export function inicialDia(iso: string): string {
  return ['D', 'L', 'M', 'M', 'J', 'V', 'S'][new Date(`${iso}T12:00:00`).getDay()];
}

import type { Prospecto, ResultadoLlamada } from './api';
import { conDistancia, horaCita, porCercania, type Parada, type Posicion } from './ruta';
import { fechaLocal, sumarDias } from './fechas';
import { IconCalendario, IconNoInteres, IconReloj, IconSinSenal, IconX } from './icons';

// Cómo se ve cada resultado de una llamada (mismo estilo que los resultados
// de visita en resultados.tsx). El valor es el que guarda el servidor.
export const LLAMADA_UI: { valor: ResultadoLlamada; etiqueta: string; Icon: typeof IconReloj; color: string; fondo: string }[] = [
  { valor: 'cita', etiqueta: 'Agendé visita', Icon: IconCalendario, color: '#15703f', fondo: '#dcf1e5' },
  { valor: 'llamar_despues', etiqueta: 'Llamar más tarde', Icon: IconReloj, color: '#b8611a', fondo: '#fdecdb' },
  { valor: 'no_contesto', etiqueta: 'No contestó', Icon: IconSinSenal, color: '#4f5c55', fondo: '#eceff0' },
  { valor: 'no_interesa', etiqueta: 'No le interesa', Icon: IconNoInteres, color: '#b23a2b', fondo: '#fbe3e0' },
  { valor: 'numero_equivocado', etiqueta: 'Número equivocado', Icon: IconX, color: '#4f5c55', fondo: '#eceff0' },
];

export function llamadaUI(valor: ResultadoLlamada) {
  return LLAMADA_UI.find((r) => r.valor === valor)!;
}

// Para marcar: solo dígitos (y un + inicial).
export function telHref(tel: string): string {
  return `tel:${tel.replace(/[^+\d]/g, '')}`;
}

// "5512345678" → "55 1234 5678"; cualquier otro formato se deja como viene.
export function textoTelefono(tel: string): string {
  const d = tel.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 2)} ${d.slice(2, 6)} ${d.slice(6)}` : tel;
}

export const tieneTelefono = (p: Prospecto) => !!p.telefono && !p.telefonoInvalido;

export interface GrupoLlamadas { clave: string; titulo: string; nota?: string; paradas: Parada[] }

// Los negocios pendientes con teléfono, en el orden en que conviene llamar:
// primero los que pidieron que se les llame, luego por el día en que toca
// visitarlos (llamar antes de ir) y, dentro del día, los que no han
// contestado al final. Los que ya tienen cita o dijeron que no, aparte.
export function agruparLlamadas(lista: Prospecto[], pos: Posicion | null, hoy = fechaLocal()): { grupos: GrupoLlamadas[]; yaLlamaste: Parada[]; total: number } {
  const conTel = lista.filter((p) => p.estado === 'por_visitar' && tieneTelefono(p)).map((p) => conDistancia(p, pos, hoy));
  const resuelta = (p: Parada) => !!horaCita(p) || p.ultimaLlamada?.resultado === 'no_interesa';
  const yaLlamaste = conTel.filter(resuelta)
    .sort((a, b) => (b.ultimaLlamada?.en ?? '').localeCompare(a.ultimaLlamada?.en ?? ''));
  const porLlamar = conTel.filter((p) => !resuelta(p));

  const peso = (p: Parada) => (p.ultimaLlamada?.resultado === 'no_contesto' ? 1 : 0);
  const ordenar = (ps: Parada[]) => ps.sort((a, b) => peso(a) - peso(b) || porCercania(a, b));
  const manana = sumarDias(hoy, 1);
  const cuando = (p: Parada) => p.fechaPlan ?? p.semanaInicio ?? null;

  const devolver = porLlamar.filter((p) => p.ultimaLlamada?.resultado === 'llamar_despues');
  const resto = porLlamar.filter((p) => p.ultimaLlamada?.resultado !== 'llamar_despues');
  const grupos: GrupoLlamadas[] = [
    { clave: 'devolver', titulo: 'Te pidieron que llames', nota: 'Primero estos', paradas: ordenar(devolver) },
    { clave: 'hoy', titulo: 'Para visitar hoy', nota: 'Llama para confirmar que estén', paradas: ordenar(resto.filter((p) => { const c = cuando(p); return !!c && c <= hoy; })) },
    { clave: 'manana', titulo: 'Para visitar mañana', nota: 'Agenda la hora desde hoy', paradas: ordenar(resto.filter((p) => cuando(p) === manana)) },
    { clave: 'despues', titulo: 'Próximos días', paradas: resto.filter((p) => { const c = cuando(p); return !!c && c > manana; }).sort((a, b) => cuando(a)!.localeCompare(cuando(b)!) || peso(a) - peso(b)) },
    { clave: 'sinFecha', titulo: 'Sin día asignado', paradas: ordenar(resto.filter((p) => !cuando(p))) },
  ];
  return { grupos: grupos.filter((g) => g.paradas.length), yaLlamaste, total: conTel.length };
}

// "hace 5 min", "hace 2 h", "ayer", "lun 3 nov".
export function haceCuanto(iso: string, ahora = Date.now()): string {
  const min = Math.round((ahora - Date.parse(iso)) / 60000);
  if (min < 1) return 'hace un momento';
  if (min < 60) return `hace ${min} min`;
  if (min < 12 * 60) return `hace ${Math.round(min / 60)} h`;
  const dia = fechaLocal(new Date(iso));
  const hoy = fechaLocal(new Date(ahora));
  if (dia === hoy) return 'hoy';
  if (dia === sumarDias(hoy, -1)) return 'ayer';
  return new Date(iso).toLocaleDateString('es-MX', { weekday: 'short', day: 'numeric', month: 'short' });
}

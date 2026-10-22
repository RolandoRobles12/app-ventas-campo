import type { ResultadoVisita } from '@aviva/ui';
import { IconCalendario, IconDocumento, IconInfo, IconNoInteres, IconTienda } from './icons';

// Cómo se ve cada resultado en la app: texto corto para tocar rápido (el
// valor que se guarda sigue siendo el de RESULTADO_OPTIONS), ícono y color.
// Ordenados del mejor al peor resultado.
export const RESULTADOS_UI: { valor: ResultadoVisita; etiqueta: string; Icon: typeof IconInfo; color: string; fondo: string }[] = [
  { valor: 'Se realizó solicitud', etiqueta: 'Hizo solicitud', Icon: IconDocumento, color: '#15703f', fondo: '#dcf1e5' },
  { valor: 'Se dejó información', etiqueta: 'Dejé información', Icon: IconInfo, color: '#b8611a', fondo: '#fdecdb' },
  { valor: 'Se reagenda visita', etiqueta: 'Volver otro día', Icon: IconCalendario, color: '#1d5fae', fondo: '#e2ecfb' },
  { valor: 'Cliente no interesado', etiqueta: 'No le interesa', Icon: IconNoInteres, color: '#b23a2b', fondo: '#fbe3e0' },
  { valor: 'No es un negocio válido o existente', etiqueta: 'Cerrado o no existe', Icon: IconTienda, color: '#4f5c55', fondo: '#eceff0' },
];

export function resultadoUI(valor: string) {
  return RESULTADOS_UI.find((r) => r.valor === valor) ?? { valor, etiqueta: valor, Icon: IconInfo, color: '#4f5c55', fondo: '#eceff0' };
}

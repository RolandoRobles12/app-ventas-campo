export const colors = {
  green900: '#0d3d24',
  green800: '#0a3320',
  green700: '#0f5132',
  green600: '#157347',
  green500: '#22a36c',
  green400: '#22bd78',
  green300: '#3ddc97',
  green200: '#8fcfae',
  green100: '#e3f3e9',
  green50: '#eef5f0',

  mintBg1: '#cfe8dc',
  mintBg2: '#dcefe5',
  mintBg3: '#e9f4ee',

  orange900: '#7a3d09',
  orange700: '#c96a1e',
  orange600: '#e07a26',
  orange500: '#ef8b3e',
  orange100: '#fdecdb',

  purple900: '#2b2350',
  purple700: '#2e2566',
  purple500: '#7c6ff0',
  purple300: '#a99cff',
  purple100: '#e6e3f7',

  blue600: '#2a6fdb',
  blue100: '#e2ecfb',
  teal600: '#0e8a8a',
  teal100: '#d7f0f0',
  magenta600: '#a83292',
  magenta100: '#f6e2f1',
  violet600: '#7a52c9',
  violet500: '#a855f7',
  red600: '#d64545',
  red700: '#c0392b',
  red100: '#fbe3e0',

  ink900: '#161a17',
  ink800: '#1a1f1c',
  ink700: '#263238',
  ink600: '#2c3631',
  ink500: '#3a4a41',
  ink400: '#5a665f',
  ink300: '#6f7d75',
  ink200: '#8a978f',
  ink100: '#9aa39c',
  ink50: '#b9c1ba',

  border100: '#e6ece7',
  border200: '#eef2ee',
  border300: '#f2f5f2',
  surface100: '#eef3ee',
  surface200: '#dfe6e0',

  hubspotOrange: '#ff7a59',
  hubspotOrangeDark: '#e0562f',
} as const;

export const RESULTADO_OPTIONS = [
  'Se dejó información',
  'Se realizó solicitud',
  'Cliente no interesado',
  'No es un negocio válido o existente',
  'Se reagenda visita',
] as const;

export type ResultadoVisita = (typeof RESULTADO_OPTIONS)[number];

export const resultadoColor = (r: string): string => {
  switch (r) {
    case 'Se realizó solicitud':
      return colors.green500;
    case 'Se dejó información':
      return colors.orange500;
    case 'Cliente no interesado':
      return colors.red600;
    case 'No es un negocio válido o existente':
      return colors.ink50;
    case 'Se reagenda visita':
      return colors.blue600;
    default:
      return colors.ink100;
  }
};

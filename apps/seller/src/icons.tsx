// Íconos de línea (mismo trazo que el resto de la app), como componentes para
// no repetir el SVG en cada pantalla.
interface P { size?: number; color?: string; stroke?: number }

function Svg({ size = 22, color = 'currentColor', stroke = 2, children }: P & { children: React.ReactNode }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {children}
    </svg>
  );
}

export const IconPin = (p: P) => <Svg {...p}><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></Svg>;
export const IconRuta = (p: P) => <Svg {...p}><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></Svg>;
export const IconMapa = (p: P) => <Svg {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></Svg>;
export const IconHistorial = (p: P) => <Svg {...p}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><polyline points="3 3 3 8 8 8" /><polyline points="12 7 12 12 15 14" /></Svg>;
export const IconNavegar = (p: P) => <Svg {...p}><polygon points="3 11 22 2 13 21 11 13 3 11" /></Svg>;
export const IconTelefono = (p: P) => <Svg {...p}><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.9 2Z" /></Svg>;
export const IconCamara = (p: P) => <Svg {...p}><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" /><circle cx="12" cy="13" r="4" /></Svg>;
export const IconCheck = (p: P) => <Svg {...p}><polyline points="20 6 9 17 4 12" /></Svg>;
export const IconX = (p: P) => <Svg {...p}><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></Svg>;
export const IconMas = (p: P) => <Svg {...p}><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></Svg>;
export const IconAtras = (p: P) => <Svg {...p}><polyline points="15 18 9 12 15 6" /></Svg>;
export const IconSiguiente = (p: P) => <Svg {...p}><polyline points="9 18 15 12 9 6" /></Svg>;
export const IconAbajo = (p: P) => <Svg {...p}><polyline points="6 9 12 15 18 9" /></Svg>;
export const IconRecargar = (p: P) => <Svg {...p}><polyline points="23 4 23 10 17 10" /><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10" /></Svg>;
export const IconNube = (p: P) => <Svg {...p}><path d="M18 10h-1.3A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" /></Svg>;
export const IconSinSenal = (p: P) => <Svg {...p}><line x1="1" y1="1" x2="23" y2="23" /><path d="M16.7 11.1A10.9 10.9 0 0 1 19 12.6M5 12.6a10.9 10.9 0 0 1 5.2-2.5M10.7 5.1A16 16 0 0 1 22.6 9M1.4 9a16 16 0 0 1 4.7-2.9M8.5 16.1a6 6 0 0 1 6.9 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></Svg>;
export const IconReloj = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></Svg>;
export const IconCalendario = (p: P) => <Svg {...p}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></Svg>;
export const IconDocumento = (p: P) => <Svg {...p}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="9 15 11 17 15 13" /></Svg>;
export const IconInfo = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></Svg>;
export const IconTienda = (p: P) => <Svg {...p}><path d="M3 9l1.5-5h15L21 9" /><path d="M3 9h18v2a3 3 0 0 1-6 0 3 3 0 0 1-6 0 3 3 0 0 1-6 0z" /><path d="M5 13v8h14v-8" /></Svg>;
export const IconNoInteres = (p: P) => <Svg {...p}><circle cx="12" cy="12" r="10" /><line x1="4.9" y1="4.9" x2="19.1" y2="19.1" /></Svg>;
export const IconFuego = ({ size = 18, color = 'currentColor' }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden="true"><path d="M12 2c1 3-1 4-1 6a3 3 0 0 0 6 0c0-1 0-2-.5-3 2 2 3.5 4.5 3.5 8a8 8 0 0 1-16 0c0-3 1.5-5.5 4-8 0 2 1 3 2 3.5C12.5 8 11 5 12 2Z" /></svg>
);
export const IconSalir = (p: P) => <Svg {...p}><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></Svg>;

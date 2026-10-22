import type { ReactNode } from 'react';

// Marco de la app: ocupa toda la pantalla de la tablet (hasta 1100px de
// ancho, centrado en pantallas más grandes) con el contenido desplazable y
// la barra de navegación fija abajo.
export function AppShell({ children }: { children?: ReactNode }) {
  return (
    <div
      style={{
        // svh (no dvh): dvh se recalcula con la barra dinámica del navegador
        // y en varias tablets termina midiendo más que el área realmente
        // visible, empujando la barra de abajo fuera de pantalla. svh es el
        // tamaño mínimo garantizado del viewport, así que la barra siempre cabe.
        width: '100%', maxWidth: 1100, height: '100svh', margin: '0 auto', position: 'relative',
        overflow: 'hidden', background: '#eef5f0', display: 'flex', flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}

// Contenedor de cada pantalla: ancho cómodo de lectura y márgenes de tablet.
export function Pantalla({ children, ancho = 860 }: { children: ReactNode; ancho?: number }) {
  return <div style={{ maxWidth: ancho, margin: '0 auto', padding: '18px 18px 28px' }}>{children}</div>;
}

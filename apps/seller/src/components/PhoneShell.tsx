import type { ReactNode } from 'react';

export function PhoneShell({ children, bg = true }: { children?: ReactNode; bg?: boolean }) {
  return (
    <div
      style={{
        // height (no minHeight): con solo un mínimo, esta caja crecía más
        // alto que la pantalla cuando la lista de leads era larga, y
        // entonces era la ventana del navegador la que hacía scroll de todo
        // el "teléfono" junto (barra inferior incluida) en vez de que solo
        // el contenido de en medio (el <div flex:1;overflowY:auto> de
        // App.tsx) hiciera scroll interno dejando fija la barra de abajo.
        width: '100%', maxWidth: 460, height: '100dvh', margin: '0 auto', position: 'relative',
        overflow: 'hidden', fontFamily: 'var(--font-sans)',
        background: bg ? 'linear-gradient(180deg,#cfe8dc 0%,#dcefe5 34%,#e9f4ee 100%)' : '#e9f4ee',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}

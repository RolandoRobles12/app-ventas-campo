import type { CSSProperties, ReactNode } from 'react';

function clockLabel(): string {
  return new Date().toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }).toLowerCase();
}

export function StatusBar() {
  return (
    <div style={statusBarStyle}>
      <span>{clockLabel()}</span>
      <span style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 11, letterSpacing: '.5px' }}>
        0.71K/s &#9650; &#9679; 13
      </span>
    </div>
  );
}

const statusBarStyle: CSSProperties = {
  height: 30, background: 'var(--aviva-green-700)', display: 'flex', alignItems: 'center',
  justifyContent: 'space-between', padding: '0 18px', color: '#fff', fontSize: 13, fontWeight: 600, flex: 'none',
};

export function PhoneShell({ children, bg = true }: { children: ReactNode; bg?: boolean }) {
  return (
    <div
      style={{
        width: '100%', maxWidth: 460, minHeight: '100dvh', margin: '0 auto', position: 'relative',
        overflow: 'hidden', fontFamily: 'var(--font-sans)',
        background: bg ? 'linear-gradient(180deg,#cfe8dc 0%,#dcefe5 34%,#e9f4ee 100%)' : '#e9f4ee',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {children}
    </div>
  );
}

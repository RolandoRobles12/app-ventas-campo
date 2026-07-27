import type { ReactNode } from 'react';

export function PhoneShell({ children, bg = true }: { children?: ReactNode; bg?: boolean }) {
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

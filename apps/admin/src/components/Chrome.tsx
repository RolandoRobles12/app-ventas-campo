import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@aviva/ui';

const icono = (children: ReactNode) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const SECCIONES: { titulo: string; items: { to: string; label: string; icon: ReactNode }[] }[] = [
  {
    titulo: 'Operación',
    items: [
      { to: '/resumen', label: 'Resumen', icon: icono(<><path d="M3 3v18h18" /><rect x="7" y="10" width="3" height="8" /><rect x="12" y="6" width="3" height="12" /><rect x="17" y="13" width="3" height="5" /></>) },
      { to: '/en-vivo', label: 'En vivo', icon: icono(<><circle cx="12" cy="12" r="2" /><path d="M16.2 7.8a6 6 0 0 1 0 8.5M7.8 16.2a6 6 0 0 1 0-8.5M19.1 4.9a10 10 0 0 1 0 14.2M4.9 19.1a10 10 0 0 1 0-14.2" /></>) },
      { to: '/visitas', label: 'Visitas', icon: icono(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></>) },
    ],
  },
  {
    titulo: 'Planeación',
    items: [
      { to: '/rutas', label: 'Rutas', icon: icono(<><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></>) },
      { to: '/equipo', label: 'Equipo', icon: icono(<><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>) },
    ],
  },
  {
    titulo: 'Configuración',
    items: [
      { to: '/usuarios', label: 'Administradores', icon: icono(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>) },
    ],
  },
];

export function Sidebar() {
  return (
    <nav className="adm-scroll" style={{ width: 228, flex: 'none', background: '#0d3d24', overflowY: 'auto', padding: '8px 0 20px' }}>
      {SECCIONES.map((s) => (
        <div key={s.titulo} style={{ marginTop: 14 }}>
          <div style={{ padding: '6px 22px', fontSize: 11, fontWeight: 700, letterSpacing: '1px', color: '#6f9c82', textTransform: 'uppercase' }}>{s.titulo}</div>
          {s.items.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className="navdark"
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 12, margin: '2px 10px', padding: '10px 12px', borderRadius: 8,
                fontSize: 14, color: isActive ? '#fff' : '#b5cfc0', fontWeight: isActive ? 600 : 400,
                background: isActive ? 'rgba(111,206,154,.18)' : 'transparent',
              })}
            >
              {it.icon}
              {it.label}
            </NavLink>
          ))}
        </div>
      ))}
    </nav>
  );
}

export function TopBar({ userEmail, onSignOut }: { userEmail: string; onSignOut: () => void }) {
  return (
    <div style={{ height: 60, flex: 'none', background: '#ffffff', borderBottom: '1px solid #e6ebe6', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 16, zIndex: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <img src="/favicon.png" alt="" style={{ width: 34, height: 34, borderRadius: 9 }} />
        <span style={{ fontSize: 19, fontWeight: 500, color: '#263238', letterSpacing: '.2px' }}>Aviva · Visitas de campo</span>
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={onSignOut}
        title="Cerrar sesión"
        style={{ display: 'flex', alignItems: 'center', gap: 9, background: '#f2f5f2', padding: '7px 14px 7px 10px', borderRadius: 22, border: 'none', cursor: 'pointer' }}
      >
        <div style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--aviva-green-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        </div>
        <span style={{ fontSize: 13.5, fontWeight: 500, color: '#263238' }}>{userEmail}</span>
        <span style={{ fontSize: 12.5, color: '#8a978f' }}>· Salir</span>
      </button>
    </div>
  );
}

export function Chrome({ children }: { children: ReactNode }) {
  const { user, signOutUser } = useAuth();
  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#eef3ee', position: 'relative', color: '#202723' }}>
      <TopBar userEmail={user?.email ?? ''} onSignOut={signOutUser} />
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar />
        <main className="adm-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: '#eef3ee', position: 'relative' }}>
          <div style={{ padding: '24px 28px 28px', maxWidth: 1480, margin: '0 auto' }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

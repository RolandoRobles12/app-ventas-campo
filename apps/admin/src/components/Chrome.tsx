import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '@aviva/ui';

const staticItem = (label: string, icon: ReactNode, hasChevron = false) => (
  <div className="navdark" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 20px', color: '#e3efe7', cursor: 'default' }}>
    {icon}
    <span style={{ flex: 1, fontSize: 14.5, fontWeight: 400 }}>{label}</span>
    {hasChevron && (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#7fa691" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
    )}
  </div>
);

const sectionHeader = (label: string, icon: ReactNode) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 20px 12px', color: '#fff' }}>
    {icon}
    <span style={{ flex: 1, fontSize: 14.5, fontWeight: 500 }}>{label}</span>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#cfe0d6" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15" /></svg>
  </div>
);

function NavItem({ to, label }: { to: string; label: ReactNode }) {
  return (
    <NavLink
      to={to}
      className="navdark"
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 11, padding: '10px 20px 10px 53px', cursor: 'pointer', fontSize: 13.5,
        color: isActive ? '#6fce9a' : '#9fbcac', fontWeight: isActive ? 600 : 400,
        background: isActive ? 'rgba(255,255,255,.08)' : 'transparent',
        boxShadow: isActive ? 'inset 3px 0 0 #6fce9a' : 'none',
      })}
    >
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  return (
    <div className="adm-scroll" style={{ width: 236, flex: 'none', background: '#0d3d24', overflowY: 'auto', paddingBottom: 20 }}>
      <div style={{ background: '#0a3320', color: '#fff', fontSize: 13, fontWeight: 700, letterSpacing: '.6px', padding: '16px 20px' }}>OPS.UI.MANAGEMENT</div>
      {staticItem('Home', <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9fc4ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>)}
      {staticItem('Asistencia', <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9fc4ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z" /><path d="M4 8h16" /></svg>, true)}
      {staticItem('Trackers', <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9fc4ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" /><line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" /><line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" /></svg>, true)}

      {sectionHeader('Configuration', <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>)}
      <div className="navdark" style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 10px 53px', color: '#9fbcac', cursor: 'default', fontSize: 13.5 }}>Schedules</div>
      <div className="navdark" style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 10px 53px', color: '#9fbcac', cursor: 'default', fontSize: 13.5 }}>Groups</div>
      <div className="navdark" style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 10px 53px', color: '#9fbcac', cursor: 'default', fontSize: 13.5 }}>Kiosks-Group</div>
      <div className="navdark" style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 10px 53px', color: '#9fbcac', cursor: 'default', fontSize: 13.5 }}>Overrides</div>
      <div className="navdark" style={{ display: 'flex', alignItems: 'center', padding: '10px 20px 10px 53px', color: '#9fbcac', cursor: 'default', fontSize: 13.5 }}>Kiosks Status</div>
      <NavItem to="/rutas" label={
        <span style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="6" cy="19" r="3" /><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15" /><circle cx="18" cy="5" r="3" /></svg>
          Rutas por vendedor
        </span>
      } />

      {sectionHeader('Visitas de Campo', <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>)}
      <NavItem to="/dashboard" label="Dashboard" />
      <NavItem to="/mapa" label="Mapa de Leads" />
      <NavItem to="/seguimiento" label="Seguimiento" />
      <NavItem to="/reportes" label="Reportes" />
      <NavItem to="/crm" label="CRM · Prospectos" />

      {staticItem('Diagnostic', <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9fc4ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M12 8v8M8 12h8" /></svg>, true)}
      {staticItem('About', <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="#9fc4ac" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" /></svg>)}
    </div>
  );
}

export function TopBar({ userEmail, onSignOut }: { userEmail: string; onSignOut: () => void }) {
  return (
    <div style={{ height: 60, flex: 'none', background: '#ffffff', borderBottom: '1px solid #e6ebe6', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 16, zIndex: 20 }}>
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#3a4a41" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" /></svg>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--aviva-green-700)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#8fe3b4" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><rect x="5" y="2" width="14" height="20" rx="3" /><line x1="12" y1="18" x2="12" y2="18" /></svg>
        </div>
        <span style={{ fontSize: 20, fontWeight: 500, color: '#263238', letterSpacing: '.2px' }}>OPS Administracion</span>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ width: 26, height: 17, borderRadius: 2, overflow: 'hidden', boxShadow: '0 0 0 1px #e2e2e2', display: 'flex' }}>
        <div style={{ flex: 1, background: '#006847' }} /><div style={{ flex: 1, background: '#fff' }} /><div style={{ flex: 1, background: '#ce1126' }} />
      </div>
      <button
        onClick={onSignOut}
        title="Cerrar sesión"
        style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'var(--aviva-green-700)', padding: '8px 16px 8px 12px', borderRadius: 22, border: 'none', cursor: 'pointer' }}
      >
        <div style={{ width: 22, height: 22, borderRadius: '50%', background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--aviva-green-700)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
        </div>
        <span style={{ fontSize: 14, fontWeight: 500, color: '#fff' }}>{userEmail}</span>
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
        <div className="adm-scroll" style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: '#eef3ee' }}>
          <div style={{ flex: 1, padding: '24px 28px 12px' }}>{children}</div>
          <div style={{ flex: 'none', background: '#fff', borderTop: '1px solid #e6ebe6', textAlign: 'center', padding: 16, fontSize: 14, color: '#3a6b50' }}>Copyright © 2026</div>
        </div>
      </div>
    </div>
  );
}

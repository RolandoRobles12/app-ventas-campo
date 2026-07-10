import { NavLink } from 'react-router-dom';

const items = [
  { to: '/', label: 'Inicio', icon: (c: string) => (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
  ) },
  { to: '/visitas', label: 'Visitas', icon: (c: string) => (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
  ) },
  { to: '/jornada', label: 'Jornada', icon: (c: string) => (
    <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 14"/></svg>
  ) },
];

export function BottomNav() {
  return (
    <div style={{
      flex: 'none', height: 66, background: '#fff', borderTop: '1px solid #ebeae4', display: 'flex',
      alignItems: 'stretch', boxShadow: '0 -4px 20px rgba(20,60,40,.06)',
    }}>
      {items.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          end={item.to === '/'}
          style={({ isActive }) => ({
            flex: 1, border: 'none', background: 'none', textDecoration: 'none', display: 'flex',
            flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, paddingTop: 4,
            color: isActive ? 'var(--aviva-green-700)' : 'var(--ink-100)',
          })}
        >
          {({ isActive }) => (
            <>
              {item.icon(isActive ? 'var(--aviva-green-700)' : 'var(--ink-100)')}
              <span style={{ fontSize: 11, fontWeight: 700 }}>{item.label}</span>
            </>
          )}
        </NavLink>
      ))}
    </div>
  );
}

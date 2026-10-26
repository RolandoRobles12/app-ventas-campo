import { NavLink } from 'react-router-dom';
import { IconHistorial, IconMapa, IconRuta } from '../icons';

const items = [
  { to: '/', label: 'Mi ruta', Icon: IconRuta, tour: 'nav-ruta' },
  { to: '/mapa', label: 'Mapa', Icon: IconMapa, tour: 'nav-mapa' },
  { to: '/historial', label: 'Historial', Icon: IconHistorial, tour: 'nav-historial' },
];

export function BottomNav() {
  return (
    <nav style={{
      flex: 'none', height: 70, background: '#fff', borderTop: '1px solid #dfe9e2', display: 'flex',
      alignItems: 'stretch', paddingBottom: 'env(safe-area-inset-bottom)',
    }}>
      {items.map(({ to, label, Icon, tour }) => (
        <NavLink
          key={to}
          to={to}
          data-tour={tour}
          end={to === '/'}
          className="tap"
          style={({ isActive }) => ({
            flex: 1, textDecoration: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
            color: isActive ? 'var(--aviva-green-700)' : '#8a978f',
          })}
        >
          {({ isActive }) => (
            <>
              <span style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 58, height: 32, borderRadius: 16,
                background: isActive ? 'var(--aviva-green-100)' : 'transparent',
              }}>
                <Icon size={24} stroke={isActive ? 2.4 : 2} />
              </span>
              <span style={{ fontSize: 13, fontWeight: isActive ? 800 : 600 }}>{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  );
}

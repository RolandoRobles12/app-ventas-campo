import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Recorrido, useAuth, type PasoRecorrido } from '@aviva/ui';
import { Modal, boton } from './ui';

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
      { to: '/llamadas', label: 'Llamadas', icon: icono(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3-8.6A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8.1 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.9 2Z" />) },
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
              data-tour={`nav${it.to}`}
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

export function TopBar({ userEmail, onSignOut, onAyuda }: { userEmail: string; onSignOut: () => void; onAyuda: () => void }) {
  return (
    <div style={{ height: 60, flex: 'none', background: '#ffffff', borderBottom: '1px solid #e6ebe6', display: 'flex', alignItems: 'center', padding: '0 22px', gap: 16, zIndex: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <img src="/favicon.png" alt="" style={{ width: 34, height: 34, borderRadius: 9 }} />
        <span style={{ fontSize: 19, fontWeight: 500, color: '#263238', letterSpacing: '.2px' }}>Aviva · Visitas de campo</span>
      </div>
      <div style={{ flex: 1 }} />
      <button
        onClick={onAyuda}
        data-tour="ayuda"
        title="Qué es cada pantalla y cómo usa la app el vendedor"
        style={{ display: 'flex', alignItems: 'center', gap: 7, background: '#fff', border: '1px solid #cfdcd3', color: '#0f5132', padding: '7px 13px', borderRadius: 22, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
        ¿Cómo funciona?
      </button>
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

// Recorrido del panel: qué es cada pantalla. Sale solo la primera vez (por
// navegador) y se vuelve a ver con "¿Cómo funciona?".
const PASOS_ADMIN: PasoRecorrido[] = [
  { objetivo: 'nav/resumen', titulo: 'Resumen', texto: 'Cómo va la operación en el periodo: visitas, cumplimiento de las rutas, visitas hechas en el negocio y alertas de quién necesita atención.' },
  { objetivo: 'nav/en-vivo', titulo: 'En vivo', texto: 'Dónde está cada vendedor ahorita, cuántas visitas lleva hoy y cuándo dio señal por última vez.' },
  { objetivo: 'nav/visitas', titulo: 'Visitas', texto: 'Cada visita con su foto, su resultado y si se hizo en el negocio (GPS a 50 m o menos). Toca un negocio para ver todo su historial.' },
  { objetivo: 'nav/llamadas', titulo: 'Llamadas y agenda', texto: 'A qué negocios llamaron los vendedores, qué pasó y las visitas que agendaron. El vendedor es dueño de su agenda: una cita mueve el negocio al día y hora que acordó.' },
  { objetivo: 'nav/rutas', titulo: 'Rutas', texto: 'Arma la ruta de cada vendedor con tres decisiones: zona, giros y visitas por día. Si reemplazas una ruta, las citas que el vendedor ya agendó se conservan.' },
  { objetivo: 'nav/equipo', titulo: 'Equipo', texto: 'Los vendedores llegan solos desde la base de colaboradores. Aquí eliges qué productos son de campo y qué giros visita cada uno.' },
  { objetivo: 'nav/usuarios', titulo: 'Administradores', texto: 'Quién puede entrar a este panel.' },
  { objetivo: 'ayuda', titulo: '¿Dudas después?', texto: 'Vuelve a ver esta explicación cuando quieras desde aquí.' },
];

const llaveVisto = (email: string) => `aviva.admin.onboarding.${email}`;

function leerVisto(email: string): boolean {
  try { return localStorage.getItem(llaveVisto(email)) === '1'; } catch { return true; }
}

function Bienvenida({ onRecorrido, onCerrar }: { onRecorrido: () => void; onCerrar: () => void }) {
  const punto = (titulo: string, texto: string) => (
    <li style={{ marginBottom: 8 }}><b style={{ color: '#263238' }}>{titulo}:</b> {texto}</li>
  );
  return (
    <Modal
      titulo="Bienvenido al panel de Visitas de campo"
      subtitulo="Qué hace el vendedor con la app y qué puedes ver tú desde aquí"
      onClose={onCerrar}
      ancho={600}
      pie={<>
        <button onClick={onCerrar} style={boton.secundario}>Ahora no</button>
        <button onClick={onRecorrido} style={boton.primario}>Ver el panel paso a paso (1 min)</button>
      </>}
    >
      <div style={{ fontSize: 13.5, color: '#3a4a41', lineHeight: 1.55 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.6px', color: '#6f7d75', marginBottom: 8 }}>EN LA APP DEL VENDEDOR</div>
        <ul style={{ margin: '0 0 16px', paddingLeft: 18 }}>
          {punto('Su ruta del día', 'la que armas en Rutas, ordenada del negocio más cercano al más lejano, con su meta de visitas.')}
          {punto('Registrar visita', 'elige el resultado y toma al menos una foto; el GPS dice si estaba en el negocio.')}
          {punto('Llamar', 've los negocios con teléfono, llama y anota qué pasó; si agenda una cita, el negocio pasa a ese día y hora en su ruta.')}
          {punto('Sin señal', 'visitas y llamadas se guardan en el teléfono y se envían solas al recuperar conexión.')}
          {punto('Primera vez', 'la app le muestra una guía y le deja practicar una visita que no se guarda. Puede repetirla tocando sus iniciales.')}
        </ul>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.6px', color: '#6f7d75', marginBottom: 8 }}>EN ESTE PANEL</div>
        <p style={{ margin: 0 }}>
          Ves cómo va el equipo (Resumen y En vivo), cada visita con su evidencia, las llamadas y citas, y armas las rutas.
          Casi todas las pantallas se filtran por producto, vendedor y fechas.
        </p>
      </div>
    </Modal>
  );
}

export function Chrome({ children }: { children: ReactNode }) {
  const { user, signOutUser } = useAuth();
  const navigate = useNavigate();
  const email = user?.email ?? '';
  const [bienvenida, setBienvenida] = useState(() => !!email && !leerVisto(email));
  const [recorrido, setRecorrido] = useState(false);

  const cerrarBienvenida = () => {
    setBienvenida(false);
    try { localStorage.setItem(llaveVisto(email), '1'); } catch { /* sin espacio: se vuelve a mostrar, nada más */ }
  };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#eef3ee', position: 'relative', color: '#202723' }}>
      <TopBar userEmail={email} onSignOut={signOutUser} onAyuda={() => setBienvenida(true)} />
      {bienvenida && <Bienvenida onCerrar={cerrarBienvenida} onRecorrido={() => { cerrarBienvenida(); navigate('/resumen'); setRecorrido(true); }} />}
      {recorrido && <Recorrido pasos={PASOS_ADMIN} onTerminar={() => setRecorrido(false)} color="#157347" />}
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar />
        <main className="adm-scroll" style={{ flex: 1, minWidth: 0, overflowY: 'auto', background: '#eef3ee', position: 'relative' }}>
          <div style={{ padding: '24px 28px 28px', maxWidth: 1480, margin: '0 auto' }}>{children}</div>
        </main>
      </div>
    </div>
  );
}

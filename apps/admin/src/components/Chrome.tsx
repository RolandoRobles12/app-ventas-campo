import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { Recorrido, useAuth, type PasoRecorrido } from '@aviva/ui';
import { Modal, boton } from './ui';

const icono = (children: ReactNode) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>
);

const SECCIONES: { titulo: string; items: { to: string; label: string; icon: ReactNode }[] }[] = [
  {
    titulo: 'General',
    items: [
      { to: '/tablero', label: 'Tablero', icon: icono(<><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>) },
    ],
  },
  {
    titulo: 'Operación',
    items: [
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
  { objetivo: 'nav/tablero', titulo: 'Tablero', texto: 'El embudo de campo por día, semana, mes o las fechas que elijas: de la meta (ruta + negocios nuevos) a la solicitud, su aprobación y su desembolso, con el monto desembolsado. Cada solicitud cuenta por la visita a la que el vendedor la ligó. Abajo, el mismo embudo por producto y por vendedor.' },
  { objetivo: 'nav/en-vivo', titulo: 'En vivo', texto: 'Dónde está cada vendedor ahorita, cuántas visitas lleva hoy (de su ruta y negocios nuevos) y cuándo dio señal por última vez.' },
  { objetivo: 'nav/visitas', titulo: 'Visitas', texto: 'Cada visita con su foto, su resultado y si se hizo en el negocio. Filtra por origen (negocios nuevos o de la ruta) y por alertas: ubicaciones que reportaron los vendedores (las aceptas o descartas aquí), GPS sospechoso y solicitudes sin ligar.' },
  { objetivo: 'nav/llamadas', titulo: 'Llamadas y agenda', texto: 'A qué negocios llamaron los vendedores, qué pasó y las visitas que agendaron. El vendedor recibe avisos de sus citas a las 9 am, 1 hora y 30 minutos antes.' },
  { objetivo: 'nav/rutas', titulo: 'Rutas', texto: 'Arma la ruta de cada vendedor: una o varias zonas vecinas, giros y meta de visitas por día (de ellas, cuántos negocios nuevos encuentra él). En el mismo paso marcas las zonas donde no puede ir.' },
  { objetivo: 'nav/equipo', titulo: 'Equipo', texto: 'Los vendedores llegan solos desde la base de colaboradores (quien no está en la base queda como ya no activo). Aquí eliges productos y giros, qué tan cerca del negocio deben registrar las visitas y tus vendedores de prueba.' },
  { objetivo: 'nav/usuarios', titulo: 'Administradores', texto: 'Quién puede entrar a este panel.' },
  { objetivo: 'ayuda', titulo: '¿Dudas después?', texto: 'Vuelve a ver esta explicación y las novedades cuando quieras desde aquí.' },
];

const llaveVisto = (email: string) => `aviva.admin.onboarding.${email}`;

// Qué cambió en el panel, para quien ya lo usaba. Sale una vez por versión
// (por navegador): subir NOVEDADES_VERSION al cambiar la lista.
const NOVEDADES_VERSION = '2026-11';
const llaveNovedades = (email: string) => `aviva.admin.novedades.${email}`;
const NOVEDADES: [string, string][] = [
  ['Rutas: varias zonas', 'Junta zonas vecinas en la misma ruta con "+ Agregar zona"; el recorrido de cada día pasa por todas.'],
  ['Rutas: meta de negocios nuevos', 'En "Ritmo", decide cuántas de sus visitas diarias son negocios que encuentra él en la calle. La ruta trae solo la diferencia.'],
  ['Rutas: donde no puede ir', 'Marca zonas en rojo (buscando un lugar o dibujándolas) para uno o varios vendedores. No se le planean negocios ahí y la app no le deja registrar visitas.'],
  ['Visitas en el negocio', 'La app solo deja guardar la visita cerca del negocio (Equipo → Registro de visitas). Si el vendedor dice que el negocio está en otro lugar, lo revisas en Visitas → Alertas.'],
  ['Solicitudes ligadas', 'Al marcar "Hizo solicitud", el vendedor elige cuál es su solicitud. Si no aparecía, la liga después o se liga sola. El Tablero cuenta por esa liga (ya no por la hora, salvo en visitas viejas).'],
  ['Desembolsos', 'El embudo termina en las solicitudes desembolsadas y su monto: por producto, por vendedor y la tasa de desembolso de las aprobadas.'],
  ['Tipificación corregida', 'Si el vendedor marcó otro resultado pero sí hizo la solicitud (o al revés), lo corrige desde su app. En Visitas ves el resultado original y en el Tablero cuántas corrigió cada uno.'],
  ['Avisos de citas', 'Los vendedores reciben un aviso a las 9 am y 1 hora y 30 minutos antes de cada cita.'],
  ['Equipo', 'Solo es activo quien está en la base de colaboradores. Para probar la app con tu correo, crea un vendedor de prueba: no cuenta en los indicadores.'],
];

function Novedades({ onCerrar, onRecorrido }: { onCerrar: () => void; onRecorrido: () => void }) {
  return (
    <Modal
      titulo="Novedades del panel"
      subtitulo="Lo que cambió desde la última vez"
      onClose={onCerrar}
      ancho={640}
      pie={<>
        <button onClick={onRecorrido} style={boton.secundario}>Ver el panel paso a paso</button>
        <button onClick={onCerrar} style={boton.primario}>Entendido</button>
      </>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12, fontSize: 13.5, color: '#3a4a41', lineHeight: 1.5 }}>
        {NOVEDADES.map(([t, d]) => (
          <div key={t} style={{ display: 'flex', gap: 10 }}>
            <span style={{ color: '#157347', fontWeight: 700, flex: 'none' }}>✓</span>
            <div><b style={{ color: '#263238' }}>{t}.</b> {d}</div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function leerVisto(email: string): boolean {
  try { return localStorage.getItem(llaveVisto(email)) === '1'; } catch { return true; }
}

function Bienvenida({ onRecorrido, onCerrar, onNovedades }: { onRecorrido: () => void; onCerrar: () => void; onNovedades: () => void }) {
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
        <button onClick={onNovedades} style={{ ...boton.suave, marginRight: 'auto' }}>Ver novedades</button>
        <button onClick={onCerrar} style={boton.secundario}>Ahora no</button>
        <button onClick={onRecorrido} style={boton.primario}>Ver el panel paso a paso (1 min)</button>
      </>}
    >
      <div style={{ fontSize: 13.5, color: '#3a4a41', lineHeight: 1.55 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.6px', color: '#6f7d75', marginBottom: 8 }}>EN LA APP DEL VENDEDOR</div>
        <ul style={{ margin: '0 0 16px', paddingLeft: 18 }}>
          {punto('Su ruta del día', 'la que armas en Rutas, ordenada del negocio más cercano al más lejano, con su meta de visitas (de su ruta y, si se la pides, de negocios nuevos). "Cómo llegar" le marca el camino sin salir de la app.')}
          {punto('Registrar visita', 'elige el resultado y toma al menos una foto. Solo puede guardarla estando cerca del negocio (la distancia la fijas en Equipo). Si hizo solicitud, elige cuál es en HubSpot.')}
          {punto('Zonas y avisos', 've en rojo las zonas donde no puede ir y recibe avisos de sus citas.')}
          {punto('Llamar', 've los negocios con teléfono, llama y anota qué pasó; si agenda una cita, el negocio pasa a ese día y hora en su ruta.')}
          {punto('Sin señal', 'visitas y llamadas se guardan en el teléfono y se envían solas al recuperar conexión.')}
          {punto('Primera vez', 'la app le muestra una guía y le deja practicar una visita que no se guarda. Puede repetirla tocando sus iniciales.')}
        </ul>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '.6px', color: '#6f7d75', marginBottom: 8 }}>EN ESTE PANEL</div>
        <p style={{ margin: 0 }}>
          Ves cómo va el equipo (Tablero y En vivo), cada visita con su evidencia, las llamadas y citas, y armas las rutas.
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
  // Quien ya conocía el panel ve una vez lo que cambió.
  const [novedades, setNovedades] = useState(() => {
    if (!email || !leerVisto(email)) return false;
    try { return localStorage.getItem(llaveNovedades(email)) !== NOVEDADES_VERSION; } catch { return false; }
  });
  const marcarNovedades = () => {
    try { localStorage.setItem(llaveNovedades(email), NOVEDADES_VERSION); } catch { /* sin espacio */ }
  };

  const cerrarBienvenida = () => {
    setBienvenida(false);
    marcarNovedades();
    try { localStorage.setItem(llaveVisto(email), '1'); } catch { /* sin espacio: se vuelve a mostrar, nada más */ }
  };
  const verRecorrido = () => { navigate('/tablero'); setRecorrido(true); };

  return (
    <div style={{ width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', background: '#eef3ee', position: 'relative', color: '#202723' }}>
      <TopBar userEmail={email} onSignOut={signOutUser} onAyuda={() => setBienvenida(true)} />
      {bienvenida && <Bienvenida onCerrar={cerrarBienvenida} onNovedades={() => { cerrarBienvenida(); setNovedades(true); }} onRecorrido={() => { cerrarBienvenida(); verRecorrido(); }} />}
      {novedades && !bienvenida && (
        <Novedades
          onCerrar={() => { marcarNovedades(); setNovedades(false); }}
          onRecorrido={() => { marcarNovedades(); setNovedades(false); verRecorrido(); }}
        />
      )}
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

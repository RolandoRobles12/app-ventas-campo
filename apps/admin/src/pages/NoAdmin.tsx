import { useSession } from '../session';

export function NoAdmin() {
  const { email, salir } = useSession();

  return (
    <div style={{
      width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(180deg,#cfe8dc 0%,#dcefe5 34%,#e9f4ee 100%)', padding: 24,
    }}>
      <div style={{
        background: '#fff', borderRadius: 20, padding: '36px 30px', maxWidth: 380, width: '100%',
        boxShadow: '0 10px 30px rgba(20,60,40,.12)', textAlign: 'center',
      }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: '#263238' }}>Sin acceso al panel</h1>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: '#5a665f', fontWeight: 500, lineHeight: 1.5 }}>
          {email} inició sesión correctamente, pero esa cuenta no tiene acceso de administrador. Pide a un administrador que te agregue desde "Usuarios".
        </p>
        <button
          onClick={salir}
          style={{ background: 'transparent', border: '1px solid #d9e1db', borderRadius: 12, padding: '11px 16px', fontSize: 14, fontWeight: 700, color: '#3a4a41', cursor: 'pointer' }}
        >
          Cerrar sesión
        </button>
      </div>
    </div>
  );
}

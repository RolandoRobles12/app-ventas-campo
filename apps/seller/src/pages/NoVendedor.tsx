import { AppShell } from '../components/AppShell';
import { useSession } from '../session';
import { IconSinSenal, IconTienda } from '../icons';

export function NoVendedor() {
  const { email, baja, salir } = useSession();
  const sinSenal = !navigator.onLine;

  const [titulo, detalle] = sinSenal
    ? ['Sin señal', 'Necesitas conexión la primera vez que entras en esta tablet. Busca señal y vuelve a intentarlo.']
    : baja
      ? ['Tu acceso ya no está activo', `${email} aparece dado de baja en la base de colaboradores. Si es un error, avisa a tu coordinador.`]
      : ['Cuenta sin ruta de campo', `${email} inició sesión correctamente, pero no está registrado como vendedor de campo. Pide a tu coordinador que revise tu puesto en la base de colaboradores.`];

  return (
    <AppShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', padding: '24px 28px', textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: '50%', background: '#fdecdb', color: '#e07a26', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {sinSenal ? <IconSinSenal size={38} /> : <IconTienda size={38} />}
        </div>
        <h1 style={{ margin: '20px 0 8px', fontSize: 24, fontWeight: 800, color: 'var(--ink-900)' }}>{titulo}</h1>
        <p style={{ margin: '0 0 26px', fontSize: 16, color: '#6f7d75', fontWeight: 500, lineHeight: 1.55, maxWidth: 420 }}>{detalle}</p>
        <div style={{ display: 'flex', gap: 10, width: '100%', maxWidth: 420 }}>
          <button className="btn btn-primary tap" style={{ flex: 1 }} onClick={() => window.location.reload()}>Reintentar</button>
          <button className="btn btn-secondary tap" style={{ flex: 1 }} onClick={salir}>Cerrar sesión</button>
        </div>
      </div>
    </AppShell>
  );
}

import { PhoneShell } from '../components/PhoneShell';
import { useSession } from '../session';

export function NoVendedor() {
  const { email, salir } = useSession();

  return (
    <PhoneShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '24px 22px', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--ink-900)' }}>Cuenta sin vendedor asociado</h1>
        <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--ink-300)', fontWeight: 500, lineHeight: 1.5 }}>
          {email} inició sesión correctamente, pero no hay ningún vendedor de campo registrado con ese correo. Pide al administrador que lo dé de alta.
        </p>
        <button
          onClick={salir}
          style={{ background: 'transparent', border: '1px solid var(--border-200)', borderRadius: 12, padding: '11px 16px', fontSize: 14, fontWeight: 700, color: 'var(--ink-500)', cursor: 'pointer' }}
        >
          Cerrar sesión
        </button>
      </div>
    </PhoneShell>
  );
}

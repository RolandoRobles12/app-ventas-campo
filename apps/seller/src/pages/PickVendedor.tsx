import { PhoneShell } from '../components/PhoneShell';
import { useSession } from '../session';

export function PickVendedor() {
  const { vendedores, elegir, loading } = useSession();

  return (
    <PhoneShell>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '48px 22px 24px' }}>
        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink-900)' }}>¿Quién eres?</h1>
        <p style={{ margin: '8px 0 24px', fontSize: 14, color: 'var(--ink-300)', fontWeight: 500, lineHeight: 1.5 }}>
          Selecciona tu perfil de vendedor para ver tus metas, tu ruta de visitas y tu jornada.
        </p>
        {loading && <p style={{ color: 'var(--ink-300)' }}>Cargando…</p>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {vendedores.map((v) => (
            <button
              key={v.id}
              onClick={() => elegir(v)}
              style={{
                display: 'flex', alignItems: 'center', gap: 13, background: '#fff', border: 'none',
                borderRadius: 18, padding: '13px 15px', boxShadow: '0 6px 18px rgba(20,60,40,.07)', textAlign: 'left',
              }}
            >
              <span style={{
                width: 42, height: 42, borderRadius: '50%', background: v.color, color: '#fff', flex: 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 14,
              }}>{v.iniciales}</span>
              <span style={{ flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink-800)' }}>{v.nombre}</div>
                <div style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--ink-300)' }}>{v.producto} · {v.ciudad}</div>
              </span>
            </button>
          ))}
        </div>
      </div>
    </PhoneShell>
  );
}

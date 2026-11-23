import { useState } from 'react';
import { IconCheck, IconX } from '../icons';
import { usePantallaModal } from '../analitica';

// Qué registra la app de cómo se usa, para qué y qué NO registra. Se abre
// desde el aviso del login y desde el menú (tocando las iniciales). El tono
// es el de una herramienta para el vendedor: se mide para encontrar lo que
// se le complica y arreglarlo.

// Aviso de privacidad de Aviva (URL pública). Mientras sea null no se
// muestra el enlace.
export const AVISO_PRIVACIDAD_URL: string | null = null;

const SI = [
  'Qué pantallas abres y cuánto tiempo estás en cada una',
  'Qué botones tocas, y si tocas varias veces algo que no responde',
  'Los errores de la app y cuándo te quedas sin señal',
  'Algunas veces, una grabación de la pantalla de esta app mientras la usas',
];
const NO = [
  'Lo que escribes: en las grabaciones sale como ****',
  'Tus fotos, la cámara ni el micrófono',
  'Los teléfonos de los negocios',
  'Nada fuera de esta app: ni otras apps ni tus mensajes',
];

function Lista({ items, si }: { items: string[]; si: boolean }) {
  return (
    <div className="card" style={{ padding: '4px 16px' }}>
      {items.map((t, i) => (
        <div key={t} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '11px 0', borderTop: i ? '1px solid #eef2ee' : 'none' }}>
          <span style={{ flex: 'none', width: 26, height: 26, borderRadius: '50%', background: si ? '#dcf1e5' : '#eceff0', color: si ? '#15703f' : '#4f5c55', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
            {si ? <IconCheck size={15} stroke={3} /> : <IconX size={15} stroke={3} />}
          </span>
          <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-800)', lineHeight: 1.45 }}>{t}</span>
        </div>
      ))}
    </div>
  );
}

export function QueMideLaApp({ onCerrar }: { onCerrar: () => void }) {
  usePantallaModal('Qué registra la app');
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#eef5f0', overflowY: 'auto', textAlign: 'left' }}>
      <div className="aparecer" style={{ width: '100%', maxWidth: 620, margin: '0 auto', padding: '28px 20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '1px', color: '#1d5fae' }}>TU APP</div>
        <h1 style={{ margin: '6px 0 0', fontSize: 27, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-.3px' }}>Qué registra la app y para qué</h1>
        <p style={{ margin: '10px 0 0', fontSize: 17, fontWeight: 500, color: '#3a4a41', lineHeight: 1.5 }}>
          Queremos que registrar tus visitas sea rápido y sin errores. Para eso necesitamos ver dónde se te complica la app: un botón que no responde, una pantalla confusa, algo que falla sin señal. Así sabemos qué arreglar primero.
        </p>
        <h2 className="section-title" style={{ margin: '22px 0 10px' }}>Lo que registra</h2>
        <Lista items={SI} si />
        <h2 className="section-title" style={{ margin: '22px 0 10px' }}>Lo que no registra</h2>
        <Lista items={NO} si={false} />
        <p style={{ margin: '18px 0 0', fontSize: 15, fontWeight: 600, color: '#5a665f', lineHeight: 1.5 }}>
          Lo ven solo tus líderes y quien administra la app. Las grabaciones se borran solas a los 30 días.
          {AVISO_PRIVACIDAD_URL && <> Más detalle en el <a href={AVISO_PRIVACIDAD_URL} target="_blank" rel="noreferrer" style={{ color: 'var(--aviva-green-700)', fontWeight: 800 }}>aviso de privacidad de Aviva</a>.</>}
        </p>
        <button className="btn btn-primary tap" onClick={onCerrar} style={{ width: '100%', marginTop: 22, minHeight: 58 }}>Entendido</button>
      </div>
    </div>
  );
}

// Línea bajo "Iniciar sesión" (ver RequireAuth en @aviva/ui).
export function AvisoLogin() {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <p style={{ margin: '18px 0 0', fontSize: 13, color: 'var(--ink-300)', fontWeight: 500, lineHeight: 1.5 }}>
        Al entrar aceptas que la app registre cómo la usas, para encontrar lo que se te complica y mejorarla.{' '}
        <button
          onClick={() => setAbierto(true)}
          style={{ background: 'none', border: 'none', padding: 0, font: 'inherit', fontWeight: 700, color: 'var(--aviva-green-700, #0f5132)', textDecoration: 'underline', cursor: 'pointer' }}
        >
          Qué se registra
        </button>
      </p>
      {abierto && <QueMideLaApp onCerrar={() => setAbierto(false)} />}
    </>
  );
}


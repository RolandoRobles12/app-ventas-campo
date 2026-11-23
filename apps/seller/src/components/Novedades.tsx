import { IconCalendario, IconCheck, IconDocumento, IconInfo, IconNavegar, IconNoInteres, IconPin, IconTienda } from '../icons';
import { usePantallaModal } from '../analitica';

// Qué cambió en la app, para quien ya la usaba (los nuevos lo ven en la
// bienvenida). Sale una vez por versión: subir NOVEDADES_VERSION y cambiar
// la lista cuando haya cambios que el vendedor deba conocer.
export const NOVEDADES_VERSION = '2026-11b';

const NOVEDADES = [
  { Icon: IconInfo, color: '#1d5fae', fondo: '#e2ecfb', titulo: 'Mejoramos la app con tu uso', texto: 'La app mide qué pantallas abres, qué tocas y si algo falla, y algunas veces graba la pantalla de la app (nunca la cámara ni el micrófono). Lo que escribes, tus fotos y el mapa no se graban.' },
  { Icon: IconPin, color: '#8f3025', fondo: '#fdecea', titulo: 'Registra estando en el negocio', texto: 'Si estás lejos, la app no deja guardar la visita y te dice a cuántos metros estás. Si el negocio en realidad está en otro lugar, dilo con el botón "El negocio está en otro lugar".' },
  { Icon: IconDocumento, color: '#15703f', fondo: '#dcf1e5', titulo: '"Hizo solicitud": elige cuál es', texto: 'Te mostramos tus solicitudes de hoy para que elijas la de ese negocio. Si todavía no aparece, guarda la visita: te la recordamos en "Mi ruta" para ligarla después. Si te equivocaste de resultado, también lo corriges desde ahí.' },
  { Icon: IconNavegar, color: '#1d5fae', fondo: '#e2ecfb', titulo: '"Cómo llegar" sin salir de la app', texto: 'Te marcamos el camino en el mapa, a pie o en auto, y te avisamos cuando llegaste.' },
  { Icon: IconTienda, color: '#b8611a', fondo: '#fdecdb', titulo: 'Negocios nuevos', texto: 'Si tu líder te pide encontrar negocios en la calle, tu meta tiene dos barras: los de tu ruta y los nuevos. Un negocio nuevo también puede quedar para "Volver otro día".' },
  { Icon: IconCalendario, color: '#7b1da3', fondo: '#f3e6f9', titulo: 'Avisos de tus citas', texto: 'Actívalos y te recordamos tus citas a las 9 am, 1 hora y 30 minutos antes de cada una.' },
  { Icon: IconNoInteres, color: '#c62828', fondo: '#fdecea', titulo: 'Zonas donde no puedes visitar', texto: 'Se ven en rojo en el mapa. Si estás dentro de una, la app te avisa y no deja registrar visitas.' },
];

export function Novedades({ onRecorrido, onCerrar }: { onRecorrido: () => void; onCerrar: () => void }) {
  usePantallaModal('Novedades');
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 110, background: '#eef5f0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div className="aparecer" style={{ width: '100%', maxWidth: 620, margin: '0 auto', padding: '28px 20px 24px' }}>
        <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '1px', color: '#15703f' }}>NOVEDADES</div>
        <h1 style={{ margin: '6px 0 0', fontSize: 28, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-.3px' }}>Lo nuevo en tu app</h1>
        <p style={{ margin: '8px 0 0', fontSize: 17, fontWeight: 500, color: '#3a4a41', lineHeight: 1.5 }}>Léelo una vez: cambia cómo registras algunas visitas.</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 20 }}>
          {NOVEDADES.map((n) => (
            <div key={n.titulo} className="card" style={{ display: 'flex', gap: 14, alignItems: 'flex-start', padding: '14px 16px' }}>
              <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 14, background: n.fondo, color: n.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <n.Icon size={22} />
              </span>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink-900)' }}>{n.titulo}</div>
                <div style={{ fontSize: 15, fontWeight: 600, color: '#5a665f', marginTop: 3, lineHeight: 1.45 }}>{n.texto}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 22 }}>
          <button className="btn btn-primary tap" onClick={onCerrar} style={{ minHeight: 58 }}><IconCheck size={22} stroke={3} /> Entendido</button>
          <button className="btn btn-ghost tap" onClick={onRecorrido}>Ver mi pantalla paso a paso</button>
        </div>
        <p style={{ margin: '14px 0 0', fontSize: 14, fontWeight: 600, color: '#6f7d75', textAlign: 'center' }}>Lo puedes volver a ver tocando tus iniciales.</p>
      </div>
    </div>
  );
}

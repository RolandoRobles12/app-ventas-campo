import { sincronizarPendientes, useEnLinea, useLlamadasPendientes, useVisitasPendientes } from '../offline';
import { IconNube, IconSinSenal } from '../icons';

// Píldora de la cabecera: el vendedor siempre sabe si lo que registra ya
// llegó o sigue guardado en la tablet esperando señal.
export function EstadoConexion() {
  const enLinea = useEnLinea();
  const pendientes = useVisitasPendientes() + useLlamadasPendientes();

  if (enLinea && pendientes === 0) {
    return (
      <span data-tour="conexion" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#1c7a4f', background: '#dcf1e5', padding: '7px 12px', borderRadius: 20 }}>
        <IconNube size={16} /> Al día
      </span>
    );
  }
  return (
    <button
      onClick={() => { sincronizarPendientes(); }}
      data-tour="conexion"
      className="tap"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 800, color: '#8a4b0f', background: '#fdecdb', padding: '7px 12px', borderRadius: 20 }}
    >
      {!enLinea && <IconSinSenal size={16} />}
      {!enLinea && pendientes === 0 && 'Sin señal'}
      {pendientes > 0 && `${pendientes} por enviar`}
    </button>
  );
}

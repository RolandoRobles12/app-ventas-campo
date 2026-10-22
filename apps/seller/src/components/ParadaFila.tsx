import { useNavigate } from 'react-router-dom';
import type { Parada } from '../ruta';
import { textoDistancia } from '../ruta';
import { etiquetaDia } from '../fechas';
import { IconCheck, IconSiguiente } from '../icons';

// Una parada de la ruta. Toda la fila es el botón (objetivo táctil grande):
// abre el registro de visita de ese negocio.
export function ParadaFila({ parada, numero, hecha = false }: { parada: Parada; numero?: number; hecha?: boolean }) {
  const navigate = useNavigate();
  const distancia = textoDistancia(parada.distanciaM);
  return (
    <button
      className="tap card"
      // El negocio viaja en el estado de navegación: el formulario abre al
      // instante y funciona aunque no haya señal.
      onClick={() => navigate(`/visita/${parada.id}`, { state: { prospecto: parada } })}
      disabled={hecha}
      style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', textAlign: 'left', opacity: hecha ? 0.75 : 1 }}
    >
      <span style={{
        flex: 'none', width: 46, height: 46, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 17, fontWeight: 800,
        background: hecha ? 'var(--aviva-green-100)' : parada.atrasada ? '#fde3df' : '#fff3e8',
        color: hecha ? '#15915c' : parada.atrasada ? '#b23a2b' : '#c96a1e',
      }}>
        {hecha ? <IconCheck size={22} stroke={3} /> : numero ?? '•'}
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span className="ellipsis" style={{ display: 'block', fontSize: 17, fontWeight: 800, color: 'var(--ink-900)', textDecoration: hecha ? 'line-through' : 'none' }}>{parada.nombre}</span>
        <span className="ellipsis" style={{ display: 'block', fontSize: 14, fontWeight: 500, color: '#6f7d75', marginTop: 2 }}>
          {[parada.giro, parada.direccion].filter(Boolean).join(' · ')}
        </span>
        {(parada.atrasada || parada.reagendado) && !hecha && (
          <span style={{ display: 'flex', gap: 6, marginTop: 6 }}>
            {parada.atrasada && parada.fechaPlan && (
              <span style={{ fontSize: 12, fontWeight: 800, color: '#b23a2b', background: '#fde3df', padding: '3px 9px', borderRadius: 10 }}>
                Atrasada · {etiquetaDia(parada.fechaPlan)}
              </span>
            )}
            {parada.reagendado && (
              <span style={{ fontSize: 12, fontWeight: 800, color: '#1d5fae', background: '#e2ecfb', padding: '3px 9px', borderRadius: 10 }}>Reagendada</span>
            )}
          </span>
        )}
      </span>
      {distancia && !hecha && (
        <span style={{ flex: 'none', fontSize: 14, fontWeight: 800, color: '#3a4a41', background: '#eef5f0', padding: '6px 10px', borderRadius: 10 }}>{distancia}</span>
      )}
      {!hecha && <span style={{ flex: 'none', color: '#b5c2b9' }}><IconSiguiente size={22} stroke={2.6} /></span>}
    </button>
  );
}

import { useState } from 'react';
import { IconCamara, IconCheck, IconNube, IconRuta, IconSiguiente, IconTelefono, IconTienda } from '../icons';

type Siguiente = 'recorrido' | 'practica' | 'empezar';

interface Diapositiva {
  Icon: typeof IconRuta;
  color: string;
  fondo: string;
  titulo: string;
  texto: string;
  puntos: string[];
}

const diapositivas = (nombre: string): Diapositiva[] => [
  {
    Icon: IconTienda, color: '#0f5132', fondo: '#dcf1e5',
    titulo: `¡Hola, ${nombre}!`,
    texto: 'Esta app es tu compañera en la calle. En un minuto te enseñamos para qué sirve y cómo usarla.',
    puntos: ['Ves a quién visitar hoy y cómo llegar', 'Registras cada visita con foto en segundos', 'Llamas a los negocios para armar tu agenda'],
  },
  {
    Icon: IconRuta, color: '#c96a1e', fondo: '#fdecdb',
    titulo: 'Tu ruta del día',
    texto: 'Tu coordinador arma tu lista de negocios para cada día y la app te la ordena del más cercano al más lejano.',
    puntos: ['Arriba ves tu meta: cuántas visitas llevas y cuántas te faltan', 'Tu siguiente parada siempre está a la mano, con "Cómo llegar"', 'Si terminas antes, puedes adelantar visitas de otros días'],
  },
  {
    Icon: IconCamara, color: '#1d5fae', fondo: '#e2ecfb',
    titulo: 'Registra cada visita',
    texto: 'Cuando estés en el negocio, toca "Registrar visita". Son tres pasos:',
    puntos: ['Elige cómo te fue: hizo solicitud, dejaste información, volver otro día…', 'Toma al menos una foto del negocio: es tu evidencia', 'Hazlo estando a menos de 50 m para que cuente como hecha en el negocio'],
  },
  {
    Icon: IconTelefono, color: '#15703f', fondo: '#dcf1e5',
    titulo: 'Llama y arma tu agenda',
    texto: 'En "Mi ruta", toca "Llamar" para ver los negocios que tienen teléfono.',
    puntos: ['Llama antes de ir para confirmar que te puedan atender', 'Si agendas una cita, aparece en tu ruta ese día y a esa hora', 'Si te piden que llames después, lo dejamos hasta arriba para que no se te olvide'],
  },
  {
    Icon: IconNube, color: '#4f5c55', fondo: '#eceff0',
    titulo: 'Funciona aunque no haya señal',
    texto: 'Si te quedas sin internet, sigue trabajando normal.',
    puntos: ['Tus visitas y llamadas se guardan en el teléfono', 'Se envían solas en cuanto regresa la señal', 'Arriba ves "Al día" cuando ya se envió todo'],
  },
];

// Bienvenida de la primera vez: qué es la app y para qué sirve, en
// diapositivas cortas. La última ofrece seguir con el recorrido guiado por
// la pantalla real o con una visita de práctica.
export function Bienvenida({ nombre, onSalir }: { nombre: string; onSalir: (siguiente: Siguiente) => void }) {
  const lista = diapositivas(nombre);
  const [i, setI] = useState(0);
  const final = i === lista.length;
  const d = lista[i];

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 110, background: '#eef5f0', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '14px 16px 0' }}>
        {!final && (
          <button className="tap" onClick={() => onSalir('empezar')} style={{ minHeight: 44, padding: '0 14px', fontSize: 15, fontWeight: 800, color: '#6f7d75' }}>
            Saltar
          </button>
        )}
      </div>

      <div key={i} className="aparecer" style={{ flex: 1, width: '100%', maxWidth: 560, margin: '0 auto', padding: '8px 22px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        {final ? (
          <>
            <div style={{ width: 112, height: 112, borderRadius: '50%', background: 'var(--aviva-green-500)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <IconCheck size={58} stroke={3} />
            </div>
            <h1 style={{ margin: '22px 0 0', fontSize: 28, fontWeight: 800, color: 'var(--ink-900)', textAlign: 'center' }}>¡Listo para empezar!</h1>
            <p style={{ margin: '10px 0 0', fontSize: 17, fontWeight: 500, color: '#3a4a41', lineHeight: 1.5, textAlign: 'center' }}>
              ¿Quieres que te enseñemos tu pantalla paso a paso, o prefieres practicar una visita? La práctica no se guarda ni cuenta para tu meta.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 26 }}>
              <button className="btn btn-primary tap" onClick={() => onSalir('recorrido')} style={{ minHeight: 60 }}>Enséñame mi pantalla</button>
              <button className="btn btn-secondary tap" onClick={() => onSalir('practica')} style={{ minHeight: 60 }}><IconCamara size={22} /> Practicar una visita</button>
              <button className="btn btn-ghost tap" onClick={() => onSalir('empezar')}>Empezar a trabajar</button>
            </div>
            <p style={{ margin: '18px 0 0', fontSize: 14, fontWeight: 600, color: '#6f7d75', textAlign: 'center', lineHeight: 1.5 }}>
              Puedes volver a ver todo esto cuando quieras: toca tus iniciales, arriba a la izquierda.
            </p>
          </>
        ) : (
          <>
            <div style={{ width: 112, height: 112, borderRadius: 32, background: d.fondo, color: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
              <d.Icon size={54} stroke={2.2} />
            </div>
            <h1 style={{ margin: '24px 0 0', fontSize: 28, fontWeight: 800, color: 'var(--ink-900)', textAlign: 'center', letterSpacing: '-.3px' }}>{d.titulo}</h1>
            <p style={{ margin: '10px 0 0', fontSize: 17, fontWeight: 500, color: '#3a4a41', lineHeight: 1.5, textAlign: 'center' }}>{d.texto}</p>
            <div className="card" style={{ marginTop: 22, padding: '6px 18px' }}>
              {d.puntos.map((t, j) => (
                <div key={j} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', padding: '12px 0', borderTop: j ? '1px solid #eef2ee' : 'none' }}>
                  <span style={{ flex: 'none', width: 28, height: 28, borderRadius: '50%', background: d.fondo, color: d.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
                    <IconCheck size={16} stroke={3} />
                  </span>
                  <span style={{ fontSize: 16, fontWeight: 600, color: 'var(--ink-800)', lineHeight: 1.45 }}>{t}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {!final && (
        <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '0 22px 24px', display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, display: 'flex', gap: 6 }}>
            {[...lista, null].map((_, j) => (
              <span key={j} style={{ width: j === i ? 22 : 9, height: 9, borderRadius: 5, background: j === i ? 'var(--aviva-green-700)' : '#c9d9cf', transition: 'width .2s' }} />
            ))}
          </div>
          {i > 0 && <button className="btn btn-ghost tap" onClick={() => setI(i - 1)}>Atrás</button>}
          <button className="btn btn-primary tap" onClick={() => setI(i + 1)}>
            Siguiente <IconSiguiente size={20} stroke={2.8} />
          </button>
        </div>
      )}
      {final && (
        <div style={{ width: '100%', maxWidth: 560, margin: '0 auto', padding: '0 22px 20px' }}>
          <button className="tap" onClick={() => setI(i - 1)} style={{ minHeight: 44, fontSize: 15, fontWeight: 700, color: '#6f7d75' }}>← Atrás</button>
        </div>
      )}
    </div>
  );
}

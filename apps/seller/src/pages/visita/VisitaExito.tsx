import { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSession } from '../../session';
import { useUbicacion } from '../../ubicacion';
import { rutaEnCache, useCambiosDeRuta } from '../../offline';
import { agruparRuta, textoDistancia } from '../../ruta';
import { etiquetaDia } from '../../fechas';
import { resultadoUI } from '../../resultados';
import { IconCheck, IconReloj, IconSiguiente } from '../../icons';

interface Estado {
  nombre: string;
  resultado: string;
  fotos?: number;
  pendiente?: boolean;
  reagendarPara?: string | null;
}

// Después de guardar, el siguiente paso natural es ir a la próxima parada:
// se ofrece directo (la más cercana de lo que queda hoy) para no tener que
// regresar a la lista y buscarla.
export function VisitaExito() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const { vendedor } = useSession();
  const { posicion } = useUbicacion();
  const cambios = useCambiosDeRuta();
  const s = (state as Estado | null) ?? { nombre: 'el negocio', resultado: '' };
  const r = resultadoUI(s.resultado);

  const siguiente = useMemo(() => {
    if (!vendedor) return null;
    const ruta = agruparRuta(rutaEnCache(vendedor.id) ?? [], posicion);
    return ruta.hoy[0] ?? ruta.sinFecha[0] ?? null;
    // `cambios` recalcula cuando la marca local de esta visita ya se guardó.
  }, [vendedor, posicion, cambios]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={{ maxWidth: 620, margin: '0 auto', padding: '40px 20px 28px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
      <div className="aparecer" style={{ width: 104, height: 104, borderRadius: '50%', background: 'var(--aviva-green-500)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <IconCheck size={54} stroke={3} />
      </div>
      <h1 style={{ margin: '22px 0 0', fontSize: 30, fontWeight: 800, color: 'var(--ink-900)' }}>¡Visita registrada!</h1>
      <p style={{ margin: '8px 0 0', fontSize: 17, fontWeight: 600, color: '#6f7d75' }}>{s.nombre}</p>
      {s.resultado && (
        <span style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8, background: r.fondo, color: r.color, fontWeight: 800, fontSize: 15, padding: '8px 14px', borderRadius: 20 }}>
          <r.Icon size={18} /> {r.etiqueta}{s.reagendarPara ? ` · ${etiquetaDia(s.reagendarPara)}` : ''}
        </span>
      )}

      {s.pendiente && (
        <div style={{ marginTop: 20, width: '100%', display: 'flex', alignItems: 'center', gap: 12, background: '#fdf4e7', borderRadius: 16, padding: '14px 16px', textAlign: 'left' }}>
          <span style={{ color: '#e07a26', flex: 'none', display: 'flex' }}><IconReloj size={24} /></span>
          <span style={{ fontSize: 15, fontWeight: 600, color: '#8a5a1e', lineHeight: 1.45 }}>
            Sin señal ahora mismo: la visita quedó guardada en la tablet y se enviará sola en cuanto haya conexión. No necesitas hacer nada.
          </span>
        </div>
      )}

      {siguiente ? (
        <section className="card aparecer" style={{ marginTop: 26, width: '100%', padding: 18, textAlign: 'left' }}>
          <div className="section-title" style={{ marginBottom: 8 }}>Siguiente parada</div>
          <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink-900)' }}>{siguiente.nombre}</div>
          <div className="ellipsis" style={{ fontSize: 15, fontWeight: 500, color: '#6f7d75', marginTop: 4 }}>
            {[textoDistancia(siguiente.distanciaM) && `a ${textoDistancia(siguiente.distanciaM)}`, siguiente.direccion].filter(Boolean).join(' · ')}
          </div>
          <button
            className="btn btn-primary tap"
            style={{ width: '100%', marginTop: 16, minHeight: 60 }}
            onClick={() => navigate(`/visita/${siguiente.id}`, { replace: true, state: { prospecto: siguiente } })}
          >
            Ir a la siguiente <IconSiguiente size={22} stroke={2.8} />
          </button>
        </section>
      ) : (
        <p style={{ marginTop: 26, fontSize: 16, fontWeight: 700, color: '#15703f' }}>No te quedan paradas pendientes para hoy. 🎉</p>
      )}

      <button className="btn btn-secondary tap" style={{ width: '100%', marginTop: 12 }} onClick={() => navigate('/', { replace: true })}>
        Volver a mi ruta
      </button>
    </div>
  );
}

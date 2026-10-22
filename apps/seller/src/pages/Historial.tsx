import { useEffect, useMemo, useState } from 'react';
import type { Progreso } from '../api';
import { useSession } from '../session';
import { listarVisitasPendientes, progresoConCache, progresoEnCache, sincronizarPendientes, useCambiosDeRuta, useVisitasPendientes } from '../offline';
import { etiquetaDia, fechaLocal, horaCorta, inicialDia } from '../fechas';
import { resultadoUI } from '../resultados';
import { Pantalla } from '../components/AppShell';
import { IconCamara, IconCheck, IconFuego, IconReloj } from '../icons';

interface FilaHistorial {
  clave: string;
  nombre: string;
  resultado: string;
  cuando: number;
  fotos: number;
  verificada: boolean | null;
  pendiente: boolean;
}

// Lo que el vendedor ha registrado: su semana de un vistazo y cada visita,
// incluidas las que siguen en la tablet esperando señal.
export function Historial() {
  const { vendedor } = useSession();
  const cambios = useCambiosDeRuta();
  const pendientesCount = useVisitasPendientes();
  const [progreso, setProgreso] = useState<Progreso | null>(() => (vendedor ? progresoEnCache(vendedor.id) : null));
  const [pendientes, setPendientes] = useState<Awaited<ReturnType<typeof listarVisitasPendientes>>>([]);

  useEffect(() => {
    if (!vendedor) return;
    progresoConCache(vendedor.id).then((p) => p && setProgreso(p));
    listarVisitasPendientes().then(setPendientes);
  }, [vendedor, cambios]);

  const filas = useMemo<FilaHistorial[]>(() => [
    ...pendientes.map((p, i) => ({
      clave: `p${i}`, nombre: p.nombreNegocio, resultado: p.campos.resultado ?? '', cuando: p.capturadoEn,
      fotos: 0, verificada: null, pendiente: true,
    })),
    ...(progreso?.recientes ?? []).map((v) => ({
      clave: v.id, nombre: v.nombreNegocio, resultado: v.resultado, cuando: Date.parse(v.createdAt),
      fotos: v.fotos, verificada: v.ubicacionValida, pendiente: false,
    })),
  ].sort((a, b) => b.cuando - a.cuando), [pendientes, progreso]);

  const porDia = useMemo(() => {
    const m = new Map<string, FilaHistorial[]>();
    for (const f of filas) {
      const d = fechaLocal(new Date(f.cuando));
      m.set(d, [...(m.get(d) ?? []), f]);
    }
    return [...m.entries()];
  }, [filas]);

  const hoy = fechaLocal();
  const semana = (progreso?.semana ?? []).map((d) => ({
    ...d,
    visitas: d.visitas + pendientes.filter((p) => fechaLocal(new Date(p.capturadoEn)) === d.fecha).length,
  }));
  const totalSemana = semana.reduce((s, d) => s + d.visitas, 0);
  const max = Math.max(1, ...semana.map((d) => d.visitas));

  return (
    <Pantalla>
      <h1 style={{ margin: '4px 0 16px', fontSize: 26, fontWeight: 800, color: 'var(--ink-900)' }}>Mis visitas</h1>

      <section className="card" style={{ padding: '18px 20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: 34, fontWeight: 800, color: 'var(--ink-900)' }}>{totalSemana}</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: '#6f7d75', marginLeft: 8 }}>visitas en 7 días</span>
          </div>
          {(progreso?.racha ?? 0) > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--aviva-orange-100)', color: 'var(--aviva-orange-700)', padding: '6px 11px', borderRadius: 20, fontSize: 14, fontWeight: 800 }}>
              <IconFuego size={16} color="var(--aviva-orange-500)" /> {progreso!.racha} días seguidos
            </span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, height: 120, marginTop: 16 }}>
          {semana.map((d) => (
            <div key={d.fecha} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, height: '100%', justifyContent: 'flex-end' }}>
              <span style={{ fontSize: 14, fontWeight: 800, color: d.visitas ? '#3a4a41' : '#b9c1ba' }}>{d.visitas}</span>
              <div style={{
                width: '100%', maxWidth: 46, borderRadius: '8px 8px 4px 4px', minHeight: 4,
                height: `${Math.round((d.visitas / max) * 80)}px`,
                background: d.fecha === hoy ? 'var(--aviva-green-700)' : '#9fd1b5',
              }} />
              <span style={{ fontSize: 13, fontWeight: d.fecha === hoy ? 800 : 600, color: d.fecha === hoy ? 'var(--aviva-green-700)' : '#8a978f' }}>{inicialDia(d.fecha)}</span>
            </div>
          ))}
        </div>
      </section>

      {pendientesCount > 0 && (
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12, background: '#fdf4e7', borderRadius: 16, padding: '14px 16px' }}>
          <span style={{ color: '#e07a26', display: 'flex', flex: 'none' }}><IconReloj size={22} /></span>
          <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: '#8a5a1e', lineHeight: 1.45 }}>
            {pendientesCount === 1 ? '1 visita guardada sin señal' : `${pendientesCount} visitas guardadas sin señal`}: se enviarán solas al volver la conexión.
          </span>
          <button className="btn tap" onClick={() => { sincronizarPendientes(); }} style={{ minHeight: 46, background: 'var(--aviva-orange-500)', color: '#5a2c06', fontSize: 15 }}>Enviar ahora</button>
        </div>
      )}

      {porDia.length === 0 && (
        <p style={{ marginTop: 26, textAlign: 'center', fontSize: 16, color: '#6f7d75', fontWeight: 600 }}>Aún no registras visitas en los últimos días.</p>
      )}

      {porDia.map(([dia, items]) => (
        <section key={dia} style={{ marginTop: 22 }}>
          <h2 className="section-title">{etiquetaDia(dia, hoy)} · {items.length} {items.length === 1 ? 'visita' : 'visitas'}</h2>
          <div className="card" style={{ overflow: 'hidden' }}>
            {items.map((f, i) => {
              const r = resultadoUI(f.resultado);
              return (
                <div key={f.clave} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderTop: i ? '1px solid #eef2ee' : 'none' }}>
                  <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, background: r.fondo, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <r.Icon size={22} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="ellipsis" style={{ fontSize: 16, fontWeight: 800, color: 'var(--ink-900)' }}>{f.nombre}</div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginTop: 3, fontSize: 14, fontWeight: 600, color: '#6f7d75' }}>
                      <span style={{ color: r.color, fontWeight: 800 }}>{r.etiqueta}</span>
                      <span>{horaCorta(f.cuando)}</span>
                      {f.fotos > 0 && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><IconCamara size={15} /> {f.fotos}</span>}
                      {f.verificada && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color: '#15703f' }}><IconCheck size={15} stroke={3} /> En el negocio</span>}
                    </div>
                  </div>
                  {f.pendiente && <span style={{ flex: 'none', fontSize: 12, fontWeight: 800, color: '#8a4b0f', background: '#fdecdb', padding: '5px 10px', borderRadius: 10 }}>Por enviar</span>}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </Pantalla>
  );
}

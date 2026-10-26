import { useState } from 'react';
import { ApiError, type ResultadoLlamada } from '../api';
import { guardarLlamada } from '../offline';
import { horaCita, textoDistancia, textoHora, type Parada } from '../ruta';
import { etiquetaDia, fechaLocal, sumarDias } from '../fechas';
import { LLAMADA_UI, haceCuanto, llamadaUI, telHref, textoTelefono, type GrupoLlamadas } from '../llamadas';
import { IconAbajo, IconCheck, IconTelefono } from '../icons';

// Vista "Llamar" de Mi ruta: los negocios con teléfono, agrupados en el orden
// en que conviene llamarles. Al tocar Llamar se abre el marcador del teléfono
// y, al regresar a la app, ya está abierta la hoja para anotar cómo le fue.
export function VistaLlamadas({ grupos, yaLlamaste, onAbrir }: {
  grupos: GrupoLlamadas[]; yaLlamaste: Parada[]; onAbrir: (p: Parada) => void;
}) {
  const [verLlamados, setVerLlamados] = useState(false);
  if (!grupos.length && !yaLlamaste.length) {
    return (
      <section className="card" style={{ padding: '24px 20px', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--aviva-green-100)', color: '#15915c', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
          <IconTelefono size={28} />
        </div>
        <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink-900)', marginTop: 14 }}>Ningún negocio pendiente tiene teléfono</div>
        <p style={{ margin: '8px 0 0', fontSize: 15, color: '#6f7d75', lineHeight: 1.5 }}>
          Cuando visites un negocio puedes anotar su teléfono en el registro de la visita; así la próxima vez podrás llamarle desde aquí.
        </p>
      </section>
    );
  }
  return (
    <>
      {grupos.length === 0 && (
        <section className="card" style={{ padding: '18px 20px', fontSize: 16, fontWeight: 700, color: '#15703f' }}>
          ¡Ya llamaste a todos! 🎉 Tus citas aparecen en tu ruta, en su día y a su hora.
        </section>
      )}
      {grupos.map((g) => (
        <section key={g.clave}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <h2 className="section-title" style={{ margin: 0 }}>{g.titulo} · {g.paradas.length}</h2>
            {g.nota && <span style={{ fontSize: 13, fontWeight: 600, color: '#8a978f' }}>{g.nota}</span>}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {g.paradas.map((p) => <LlamadaFila key={p.id} parada={p} onAbrir={onAbrir} mostrarDia={g.clave === 'despues' || g.clave === 'devolver'} />)}
          </div>
        </section>
      ))}
      {yaLlamaste.length > 0 && (
        <div>
          <button
            className="tap"
            onClick={() => setVerLlamados((a) => !a)}
            style={{ width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 16px', borderRadius: 16, fontSize: 16, fontWeight: 800, background: '#e3efe7', color: 'var(--ink-600)' }}
          >
            Ya llamaste · {yaLlamaste.length}
            <span style={{ display: 'flex', transform: verLlamados ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><IconAbajo size={22} /></span>
          </button>
          {verLlamados && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
              {yaLlamaste.map((p) => <LlamadaFila key={p.id} parada={p} onAbrir={onAbrir} mostrarDia />)}
            </div>
          )}
        </div>
      )}
    </>
  );
}

function LlamadaFila({ parada, onAbrir, mostrarDia }: { parada: Parada; onAbrir: (p: Parada) => void; mostrarDia: boolean }) {
  const hora = horaCita(parada);
  const ultima = parada.ultimaLlamada;
  const r = ultima ? llamadaUI(ultima.resultado) : null;
  const distancia = textoDistancia(parada.distanciaM);
  const dia = parada.fechaPlan ? etiquetaDia(parada.fechaPlan) : null;
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 12px 12px 16px' }}>
      {/* Tocar el nombre abre la hoja sin marcar (p. ej. si llamó desde otro teléfono). */}
      <button className="tap" onClick={() => onAbrir(parada)} style={{ flex: 1, minWidth: 0, textAlign: 'left', padding: '2px 0' }}>
        <span className="ellipsis" style={{ display: 'block', fontSize: 17, fontWeight: 800, color: 'var(--ink-900)' }}>{parada.nombre}</span>
        <span className="ellipsis" style={{ display: 'block', fontSize: 14, fontWeight: 600, color: '#3a4a41', marginTop: 2 }}>
          {textoTelefono(parada.telefono!)}{distancia ? ` · a ${distancia}` : ''}
        </span>
        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
          {hora && parada.fechaPlan ? (
            <span style={{ fontSize: 12, fontWeight: 800, color: '#15703f', background: '#dcf1e5', padding: '3px 9px', borderRadius: 10 }}>
              Cita · {etiquetaDia(parada.fechaPlan)} {textoHora(hora)}
            </span>
          ) : r && ultima && (
            <span style={{ fontSize: 12, fontWeight: 800, color: r.color, background: r.fondo, padding: '3px 9px', borderRadius: 10 }}>
              {r.etiqueta} · {haceCuanto(ultima.en)}
            </span>
          )}
          {mostrarDia && dia && !hora && (
            <span style={{ fontSize: 12, fontWeight: 800, color: parada.atrasada ? '#b23a2b' : '#4f5c55', background: parada.atrasada ? '#fde3df' : '#eef2ef', padding: '3px 9px', borderRadius: 10 }}>
              {parada.atrasada ? `Atrasada · ${dia}` : `Visita: ${dia}`}
            </span>
          )}
        </span>
      </button>
      <a
        href={telHref(parada.telefono!)}
        // La hoja se abre un instante después, para que esté lista al volver
        // del marcador.
        onClick={() => setTimeout(() => onAbrir(parada), 700)}
        className="btn btn-primary tap"
        style={{ flex: 'none', minHeight: 52, padding: '0 18px', textDecoration: 'none' }}
      >
        <IconTelefono size={20} /> Llamar
      </a>
    </div>
  );
}

const HORAS = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

// Hoja para anotar cómo le fue en la llamada. Lo único obligatorio es el
// resultado (y, si agendó, día y hora).
export function HojaLlamada({ parada, vendedorId, onCerrar, onGuardada }: {
  parada: Parada; vendedorId: string; onCerrar: () => void; onGuardada: (mensaje: string) => void;
}) {
  const hoy = fechaLocal();
  const [resultado, setResultado] = useState<ResultadoLlamada | null>(null);
  const [dia, setDia] = useState(() => (parada.fechaPlan && parada.fechaPlan >= hoy ? parada.fechaPlan : sumarDias(hoy, 1)));
  const [hora, setHora] = useState(() => horaCita(parada) ?? '');
  const [telefonoNuevo, setTelefonoNuevo] = useState('');
  const [notas, setNotas] = useState('');
  const [guardando, setGuardando] = useState(false);
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState('');

  const ahora = new Date();
  const horaPasada = resultado === 'cita' && !!hora && dia === hoy
    && hora < `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`;
  const faltan = [!resultado && 'resultado', resultado === 'cita' && (!hora || horaPasada) && 'hora'].filter(Boolean) as string[];
  const opcionesDia = [hoy, sumarDias(hoy, 1), sumarDias(hoy, 2)];

  const guardar = async () => {
    if (faltan.length || !resultado) { setIntento(true); return; }
    setGuardando(true);
    setError('');
    try {
      const { pendiente } = await guardarLlamada({
        vendedorId, prospectoId: parada.id, resultado, capturadoEn: Date.now(),
        ...(resultado === 'cita' ? { citaFecha: dia, citaHora: hora } : {}),
        ...(resultado === 'numero_equivocado' && telefonoNuevo.trim() ? { telefonoNuevo: telefonoNuevo.trim() } : {}),
        ...(notas.trim() ? { notas: notas.trim() } : {}),
      });
      const base = resultado === 'cita'
        ? `Cita agendada: ${etiquetaDia(dia, hoy)} a las ${textoHora(hora)}. Ya está en tu ruta.`
        : resultado === 'llamar_despues' ? `Listo. ${parada.nombre} queda hasta arriba para volver a llamar.`
          : resultado === 'no_contesto' ? 'Anotado. Inténtalo más tarde.'
            : resultado === 'no_interesa' ? 'Anotado. Ya no aparece en tus llamadas.'
              : telefonoNuevo.trim() ? 'Número actualizado.' : 'Anotado. Lo quitamos de tus llamadas.';
      onGuardada(pendiente ? `${base} Se enviará cuando haya señal.` : base);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No se pudo guardar. Intenta de nuevo.');
    } finally {
      setGuardando(false);
    }
  };

  return (
    <div onClick={onCerrar} style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(10,25,17,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} className="aparecer" style={{ width: '100%', maxWidth: 640, maxHeight: '94%', overflowY: 'auto', background: '#fff', borderRadius: '24px 24px 0 0', padding: '20px 18px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '1px', color: '#6f7d75' }}>¿CÓMO TE FUE CON LA LLAMADA?</div>
            <div style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink-900)', marginTop: 4, lineHeight: 1.2 }}>{parada.nombre}</div>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6f7d75', marginTop: 3 }}>{textoTelefono(parada.telefono!)}</div>
          </div>
          <a href={telHref(parada.telefono!)} className="btn btn-ghost tap" style={{ flex: 'none', minHeight: 48, padding: '0 14px', fontSize: 15, textDecoration: 'none' }}>
            <IconTelefono size={18} /> Volver a marcar
          </a>
        </div>

        <div className="resultados-grid" style={{ marginTop: 16 }}>
          {LLAMADA_UI.map((r) => {
            const activo = resultado === r.valor;
            return (
              <button
                key={r.valor}
                className="tap"
                onClick={() => setResultado(r.valor)}
                aria-pressed={activo}
                style={{
                  minHeight: 68, borderRadius: 16, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  border: `2.5px solid ${activo ? r.color : intento && !resultado ? '#f0b9b0' : '#e2eae4'}`,
                  background: activo ? r.fondo : '#fafcfa',
                }}
              >
                <span style={{ flex: 'none', width: 40, height: 40, borderRadius: 12, background: activo ? '#fff' : r.fondo, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <r.Icon size={22} />
                </span>
                <span style={{ flex: 1, fontSize: 15, fontWeight: 800, color: activo ? r.color : 'var(--ink-600)', lineHeight: 1.25 }}>{r.etiqueta}</span>
              </button>
            );
          })}
        </div>

        {resultado === 'cita' && (
          <div className="aparecer" style={{ marginTop: 14, background: '#eef8f2', borderRadius: 16, padding: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: '#15703f', marginBottom: 10 }}>¿Qué día?</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              {opcionesDia.map((f) => (
                <button key={f} className="chip tap" aria-pressed={dia === f} onClick={() => setDia(f)}>{etiquetaDia(f, hoy)}</button>
              ))}
              <input
                type="date" className="field" min={hoy} value={dia} aria-label="Otro día"
                onChange={(e) => e.target.value && setDia(e.target.value)}
                style={{ width: 'auto', minHeight: 44, padding: '8px 12px' }}
              />
            </div>
            <div style={{ fontSize: 15, fontWeight: 800, color: intento && !hora ? '#b23a2b' : '#15703f', margin: '14px 0 10px' }}>
              ¿A qué hora?{intento && !hora && <span style={{ fontWeight: 700 }}> · elige una</span>}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(84px, 1fr))', gap: 8 }}>
              {HORAS.map((h) => (
                <button key={h} className="chip tap" aria-pressed={hora === h} onClick={() => setHora(h)} style={{ justifyContent: 'center', padding: '0 8px' }}>{textoHora(h).replace(':00', '')}</button>
              ))}
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 10, fontSize: 14, fontWeight: 700, color: '#3a4a41' }}>
              Otra hora:
              <input type="time" className="field" value={hora} onChange={(e) => setHora(e.target.value)} style={{ width: 'auto', minHeight: 44, padding: '8px 12px' }} />
            </label>
            {horaPasada ? (
              <div style={{ fontSize: 14, fontWeight: 700, color: '#b23a2b', marginTop: 12 }}>Esa hora de hoy ya pasó: elige otra hora u otro día.</div>
            ) : hora && (
              <div style={{ fontSize: 14, fontWeight: 700, color: '#15703f', marginTop: 12 }}>
                Quedará en tu ruta: {etiquetaDia(dia, hoy)} a las {textoHora(hora)}.
              </div>
            )}
          </div>
        )}

        {resultado === 'numero_equivocado' && (
          <div className="aparecer" style={{ marginTop: 14, background: '#f4f6f5', borderRadius: 16, padding: 14 }}>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink-800)', marginBottom: 8 }}>¿Conseguiste el número correcto? <span style={{ fontWeight: 600, color: '#8a978f' }}>(opcional)</span></div>
            <input className="field" type="tel" inputMode="tel" value={telefonoNuevo} onChange={(e) => setTelefonoNuevo(e.target.value)} placeholder="Ej. 55 1234 5678" />
            <div style={{ fontSize: 13, fontWeight: 600, color: '#6f7d75', marginTop: 8 }}>Si lo dejas vacío, el negocio sale de tus llamadas (sigue en tu ruta).</div>
          </div>
        )}

        <input className="field" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Nota (opcional): con quién hablaste, qué te dijo…" style={{ marginTop: 14 }} />

        {error && <div style={{ color: '#b23a2b', fontSize: 15, fontWeight: 700, marginTop: 12 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
          <button className="btn btn-ghost tap" style={{ flex: 1 }} onClick={onCerrar}>Cancelar</button>
          <button
            className="btn tap" onClick={guardar} disabled={guardando}
            style={{ flex: 1.6, background: faltan.length ? '#9fb5a8' : 'var(--aviva-green-700)', color: '#fff' }}
          >
            {guardando ? 'Guardando…' : faltan.length ? `Falta: ${faltan.join(', ')}` : <><IconCheck size={22} stroke={3} /> Guardar</>}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { Progreso, Prospecto } from '../api';
import { useSession } from '../session';
import { useUbicacion } from '../ubicacion';
import {
  listarVisitasPendientes, progresoConCache, progresoEnCache, prospectosConCache, rutaEnCache, useCambiosDeRuta,
} from '../offline';
import { agruparRuta, comoLlegarUrl, horaCita, siguienteParada, textoDistancia, textoHora, type Parada } from '../ruta';
import { agruparLlamadas } from '../llamadas';
import { etiquetaDia, fechaLarga, fechaLocal } from '../fechas';
import { useRecorrido } from '../recorrido';
import { Pantalla } from '../components/AppShell';
import { ParadaFila } from '../components/ParadaFila';
import { EstadoConexion } from '../components/EstadoConexion';
import { HojaLlamada, VistaLlamadas } from '../components/Llamadas';
import { IconAbajo, IconCamara, IconCheck, IconFuego, IconInfo, IconMas, IconNavegar, IconRecargar, IconRuta, IconSalir, IconTelefono, IconTienda } from '../icons';

const RECARGA_AL_VOLVER_MS = 2 * 60 * 1000;

export function Hoy() {
  const { vendedor, salir } = useSession();
  const { posicion, refrescar: refrescarUbicacion } = useUbicacion();
  const navigate = useNavigate();
  const cambios = useCambiosDeRuta();
  const recorrido = useRecorrido();
  // La vista va en la URL: al volver de registrar una visita se queda donde estaba.
  const [params, setParams] = useSearchParams();
  const vista = params.get('vista') === 'llamar' ? 'llamar' : 'ruta';
  const pestanas = useRef<HTMLDivElement>(null);
  const cambiarVista = (v: 'ruta' | 'llamar') => {
    setParams(v === 'llamar' ? { vista: v } : {}, { replace: true });
    // En una sola columna (teléfono, tablet vertical) la lista queda abajo
    // de la siguiente parada: se sube para que se note el cambio.
    if (window.innerWidth < 900) pestanas.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  const [hoja, setHoja] = useState<Parada | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 6000);
    return () => clearTimeout(t);
  }, [aviso]);

  const [lista, setLista] = useState<Prospecto[] | null>(() => (vendedor ? rutaEnCache(vendedor.id) : null));
  const [progreso, setProgreso] = useState<Progreso | null>(() => (vendedor ? progresoEnCache(vendedor.id) : null));
  const [pendientesHoy, setPendientesHoy] = useState(0);
  const [cargando, setCargando] = useState(false);
  const [menu, setMenu] = useState(false);
  const ultimaCarga = useRef(0);

  const cargar = useCallback(() => {
    if (!vendedor) return;
    ultimaCarga.current = Date.now();
    setCargando(true);
    const hoy = fechaLocal();
    Promise.all([
      prospectosConCache(vendedor.id).then(setLista).catch(() => setLista((l) => l ?? [])),
      progresoConCache(vendedor.id).then((p) => p && setProgreso(p)),
      listarVisitasPendientes().then((ps) => setPendientesHoy(ps.filter((p) => fechaLocal(new Date(p.capturadoEn)) === hoy).length)),
    ]).finally(() => setCargando(false));
  }, [vendedor]);

  useEffect(cargar, [cargar, cambios]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaCarga.current > RECARGA_AL_VOLVER_MS) cargar();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [cargar]);

  const ruta = useMemo(() => agruparRuta(lista ?? [], posicion), [lista, posicion]);
  const llamadas = useMemo(() => agruparLlamadas(lista ?? [], posicion), [lista, posicion]);
  const porLlamar = llamadas.grupos.reduce((n, g) => n + g.paradas.length, 0);

  if (!vendedor) return null;

  const hoyIso = fechaLocal();
  const visitasHoy = (progreso?.hoy === hoyIso ? progreso.visitasHoy : 0) + pendientesHoy;
  const meta = ruta.planeadosHoy || progreso?.visitasPorDia || vendedor.rutaConfig?.visitasPorDia || 0;
  const siguiente: Parada | undefined = siguienteParada(ruta);
  const citasHoy = ruta.citasHoy.filter((p) => p !== siguiente);
  const restoHoy = ruta.hoy.filter((p) => p !== siguiente);
  const restoSinFecha = ruta.sinFecha.filter((p) => p !== siguiente);
  const primerNombre = vendedor.nombre.split(' ')[0];

  return (
    <Pantalla ancho={1060}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
        <button
          onClick={() => setMenu(true)}
          aria-label="Mi cuenta"
          data-tour="cuenta"
          className="tap"
          style={{ width: 56, height: 56, borderRadius: '50%', background: vendedor.color, color: '#fff', fontWeight: 800, fontSize: 20, flex: 'none' }}
        >{vendedor.iniciales}</button>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--ink-900)', letterSpacing: '-.3px' }}>Hola, {primerNombre}</h1>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#6f7d75', marginTop: 2 }}>{fechaLarga()}</div>
        </div>
        <EstadoConexion />
        <button
          onClick={() => { refrescarUbicacion(); cargar(); }}
          aria-label="Actualizar"
          className="tap"
          style={{ width: 48, height: 48, borderRadius: 14, background: '#fff', border: '1px solid #dfe9e2', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--aviva-green-700)', flex: 'none' }}
        >
          <span className={cargando ? 'girando' : undefined} style={{ display: 'flex' }}><IconRecargar size={22} /></span>
        </button>
      </header>

      <div className="hoy-grid">
        <div className="hoy-col-fija" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Avance visitas={visitasHoy} meta={meta} racha={progreso?.racha ?? 0} />
          {siguiente ? <SiguienteParada parada={siguiente} /> : lista && <SinRutaHoy hayProximos={ruta.proximos.length > 0} />}
          <button data-tour="nuevo" className="btn btn-secondary tap" onClick={() => navigate('/visita/nueva')} style={{ width: '100%' }}>
            <IconMas size={22} stroke={2.6} /> Registrar negocio nuevo
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div ref={pestanas} data-tour="vistas" role="tablist" style={{ display: 'flex', gap: 6, background: '#dde9e1', borderRadius: 18, padding: 5 }}>
            <BotonVista activa={vista === 'ruta'} onClick={() => cambiarVista('ruta')}><IconRuta size={20} /> Mi ruta</BotonVista>
            <BotonVista activa={vista === 'llamar'} onClick={() => cambiarVista('llamar')}>
              <IconTelefono size={19} /> Llamar
              {porLlamar > 0 && <span style={{ fontSize: 13, fontWeight: 800, background: vista === 'llamar' ? 'var(--aviva-green-700)' : '#b9cfc1', color: '#fff', padding: '2px 8px', borderRadius: 10 }}>{porLlamar}</span>}
            </BotonVista>
          </div>

          {lista == null && <div style={{ padding: 20, textAlign: 'center', color: '#6f7d75', fontWeight: 600 }}>Cargando tu ruta…</div>}

          {vista === 'llamar' && lista && (
            <VistaLlamadas grupos={llamadas.grupos} yaLlamaste={llamadas.yaLlamaste} onAbrir={setHoja} />
          )}

          {vista === 'ruta' && <>
          {citasHoy.length > 0 && (
            <Seccion titulo={`Tus citas de hoy · ${citasHoy.length}`} nota="Por hora" tour="lista">
              {citasHoy.map((p) => <ParadaFila key={p.id} parada={p} />)}
            </Seccion>
          )}

          {restoHoy.length > 0 && (
            <Seccion titulo={`Más paradas de hoy · ${restoHoy.length}`} nota={posicion ? 'La más cercana primero' : undefined} tour={citasHoy.length ? undefined : 'lista'}>
              {restoHoy.map((p, i) => <ParadaFila key={p.id} parada={p} numero={i + 2} />)}
            </Seccion>
          )}

          {restoSinFecha.length > 0 && (
            <Seccion titulo={`${ruta.hoy.length ? 'Otros pendientes' : 'Tus pendientes'} · ${restoSinFecha.length}`} nota="Sin día asignado" tour={citasHoy.length || restoHoy.length ? undefined : 'lista'}>
              {restoSinFecha.map((p, i) => <ParadaFila key={p.id} parada={p} numero={ruta.hoy.length ? undefined : i + 2} />)}
            </Seccion>
          )}

          {ruta.visitadasHoy.length > 0 && (
            <Plegable titulo={`Visitadas hoy · ${ruta.visitadasHoy.length}`}>
              {ruta.visitadasHoy.map((p) => <ParadaFila key={p.id} parada={{ ...p, distanciaM: null, atrasada: false }} hecha />)}
            </Plegable>
          )}

          {ruta.proximos.length > 0 && (
            <Seccion titulo="Próximos días" nota="Si terminas antes, puedes adelantar visitas">
              {ruta.proximos.slice(0, 7).map((d) => (
                <Plegable key={d.fecha} titulo={`${etiquetaDia(d.fecha, hoyIso)} · ${d.paradas.length} ${d.paradas.length === 1 ? 'negocio' : 'negocios'}`} discreto>
                  {d.paradas.map((p) => <ParadaFila key={p.id} parada={p} numero={p.orden ?? undefined} />)}
                </Plegable>
              ))}
            </Seccion>
          )}
          </>}
        </div>
      </div>

      {hoja && (
        <HojaLlamada
          parada={hoja}
          vendedorId={vendedor.id}
          onCerrar={() => setHoja(null)}
          onGuardada={(mensaje) => { setHoja(null); setAviso(mensaje); }}
        />
      )}

      {aviso && (
        <div role="status" className="aparecer" onClick={() => setAviso(null)} style={{ position: 'absolute', left: 16, right: 16, bottom: 86, zIndex: 80, display: 'flex', justifyContent: 'center', pointerEvents: 'none' }}>
          <div style={{ maxWidth: 560, display: 'flex', alignItems: 'center', gap: 10, background: '#163d2a', color: '#fff', borderRadius: 16, padding: '14px 16px', fontSize: 15, fontWeight: 700, lineHeight: 1.4, boxShadow: '0 8px 24px rgba(0,0,0,.25)', pointerEvents: 'auto' }}>
            <span style={{ flex: 'none', color: '#8fe3b6', display: 'flex' }}><IconCheck size={22} stroke={3} /></span>
            {aviso}
          </div>
        </div>
      )}

      {menu && (
        <div onClick={() => setMenu(false)} style={{ position: 'absolute', inset: 0, zIndex: 90, background: 'rgba(10,25,17,.45)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} className="aparecer" style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: '24px 24px 0 0', padding: '22px 20px 26px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <span style={{ width: 52, height: 52, borderRadius: '50%', background: vendedor.color, color: '#fff', fontWeight: 800, fontSize: 19, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{vendedor.iniciales}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink-900)' }}>{vendedor.nombre}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#6f7d75' }}>{[vendedor.producto, vendedor.rutaConfig?.zona.etiqueta || vendedor.zona].filter(Boolean).join(' · ')}</div>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost tap" style={{ justifyContent: 'flex-start' }} onClick={() => { setMenu(false); recorrido.verBienvenida(); }}>
                <IconInfo size={20} /> Ver la guía de la app
              </button>
              <button className="btn btn-ghost tap" style={{ justifyContent: 'flex-start' }} onClick={() => { setMenu(false); recorrido.iniciarRecorrido(); }}>
                <IconRuta size={20} /> Recorrido por mi pantalla
              </button>
              <button className="btn btn-ghost tap" style={{ justifyContent: 'flex-start' }} onClick={() => { setMenu(false); recorrido.practicar(); }}>
                <IconCamara size={20} /> Practicar una visita
              </button>
            </div>
            <p style={{ margin: '16px 0 0', fontSize: 14, color: '#6f7d75', lineHeight: 1.5 }}>
              Si cierras sesión tendrás que volver a entrar con tu cuenta de Google para registrar visitas.
            </p>
            <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
              <button className="btn btn-ghost tap" style={{ flex: 1 }} onClick={() => setMenu(false)}>Cancelar</button>
              <button className="btn tap" style={{ flex: 1, background: '#c0392b', color: '#fff' }} onClick={salir}><IconSalir size={20} /> Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}
    </Pantalla>
  );
}

function Avance({ visitas, meta, racha }: { visitas: number; meta: number; racha: number }) {
  const pct = meta > 0 ? Math.min(100, Math.round((visitas / meta) * 100)) : 0;
  const faltan = Math.max(0, meta - visitas);
  const mensaje = meta === 0
    ? (visitas > 0 ? '¡Buen trabajo! Sigue así.' : 'Registra tu primera visita del día.')
    : faltan === 0 ? '¡Cumpliste la meta de hoy!'
      : faltan === 1 ? 'Te falta 1 visita para tu meta.' : `Te faltan ${faltan} visitas para tu meta.`;
  return (
    <section data-tour="avance" className="card" style={{ padding: '18px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span className="section-title" style={{ margin: 0 }}>Visitas de hoy</span>
        {racha > 0 && (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--aviva-orange-100)', color: 'var(--aviva-orange-700)', padding: '6px 11px', borderRadius: 20, fontSize: 14, fontWeight: 800 }}>
            <IconFuego size={16} color="var(--aviva-orange-500)" /> {racha} {racha === 1 ? 'día' : 'días'} seguidos
          </span>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 8 }}>
        <span style={{ fontSize: 52, fontWeight: 800, color: 'var(--ink-900)', lineHeight: 1 }}>{visitas}</span>
        {meta > 0 && <span style={{ fontSize: 20, fontWeight: 700, color: '#8a978f' }}>de {meta}</span>}
      </div>
      {meta > 0 && (
        <div style={{ height: 14, borderRadius: 8, background: '#e6efe9', overflow: 'hidden', marginTop: 12 }}>
          <div style={{ height: '100%', width: `${pct}%`, borderRadius: 8, background: faltan === 0 ? 'var(--aviva-green-500)' : 'var(--aviva-green-700)', transition: 'width .4s ease' }} />
        </div>
      )}
      <div style={{ fontSize: 15, fontWeight: 700, color: faltan === 0 && meta > 0 ? '#15703f' : '#3a4a41', marginTop: 10 }}>{mensaje}</div>
    </section>
  );
}

function SiguienteParada({ parada }: { parada: Parada }) {
  const navigate = useNavigate();
  const distancia = textoDistancia(parada.distanciaM);
  const hora = horaCita(parada);
  return (
    <section data-tour="siguiente" className="aparecer" style={{ background: 'var(--aviva-green-700)', borderRadius: 22, padding: '18px 20px 20px', color: '#fff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '1px', color: '#9fd8b8' }}>
          {parada.atrasada ? 'ATRASADA · SIGUIENTE PARADA' : hora ? `CITA A LAS ${textoHora(hora).toUpperCase()}` : 'SIGUIENTE PARADA'}
        </span>
        {distancia && <span style={{ fontSize: 15, fontWeight: 800, background: 'rgba(255,255,255,.16)', padding: '5px 11px', borderRadius: 12 }}>a {distancia}</span>}
      </div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 10, lineHeight: 1.2 }}>{parada.nombre}</div>
      <div style={{ fontSize: 15, fontWeight: 500, color: '#cfe9da', marginTop: 6, lineHeight: 1.4 }}>
        {[parada.giro, parada.direccion].filter(Boolean).join(' · ')}
      </div>
      <div style={{ display: 'flex', gap: 10, marginTop: 18, flexWrap: 'wrap' }}>
        <a
          href={comoLlegarUrl(parada)} target="_blank" rel="noreferrer" className="btn tap"
          style={{ flex: 1, minWidth: 150, background: 'rgba(255,255,255,.14)', color: '#fff', textDecoration: 'none', border: '2px solid rgba(255,255,255,.35)' }}
        >
          <IconNavegar size={20} stroke={2.4} /> Cómo llegar
        </a>
        <button
          className="btn tap"
          onClick={() => navigate(`/visita/${parada.id}`, { state: { prospecto: parada } })}
          style={{ flex: 1.3, minWidth: 170, background: '#fff', color: 'var(--aviva-green-700)' }}
        >
          Registrar visita
        </button>
      </div>
    </section>
  );
}

function SinRutaHoy({ hayProximos }: { hayProximos: boolean }) {
  return (
    <section className="card" style={{ padding: '24px 20px', textAlign: 'center' }}>
      <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--aviva-green-100)', color: '#15915c', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto' }}>
        <IconTienda size={30} />
      </div>
      <div style={{ fontSize: 19, fontWeight: 800, color: 'var(--ink-900)', marginTop: 14 }}>No tienes paradas pendientes para hoy</div>
      <p style={{ margin: '8px 0 0', fontSize: 15, color: '#6f7d75', lineHeight: 1.5 }}>
        {hayProximos
          ? 'Puedes adelantar visitas de los próximos días o registrar un negocio nuevo.'
          : 'Tu coordinador todavía no te asigna ruta. Mientras tanto, registra los negocios que visites.'}
      </p>
    </section>
  );
}

function BotonVista({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      role="tab" aria-selected={activa} onClick={onClick} className="tap"
      style={{
        flex: 1, minHeight: 50, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontSize: 16, fontWeight: 800,
        background: activa ? '#fff' : 'transparent', color: activa ? 'var(--aviva-green-700)' : '#4f6157',
        boxShadow: activa ? '0 1px 4px rgba(20,60,40,.12)' : 'none',
      }}
    >{children}</button>
  );
}

function Seccion({ titulo, nota, tour, children }: { titulo: string; nota?: string; tour?: string; children: React.ReactNode }) {
  return (
    <section data-tour={tour}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
        <h2 className="section-title" style={{ margin: 0 }}>{titulo}</h2>
        {nota && <span style={{ fontSize: 13, fontWeight: 600, color: '#8a978f' }}>{nota}</span>}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{children}</div>
    </section>
  );
}

function Plegable({ titulo, discreto = false, children }: { titulo: string; discreto?: boolean; children: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false);
  return (
    <div>
      <button
        className="tap"
        onClick={() => setAbierto((a) => !a)}
        style={{
          width: '100%', minHeight: 54, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
          padding: '0 16px', borderRadius: 16, fontSize: 16, fontWeight: 800,
          background: discreto ? '#fff' : '#e3efe7', color: 'var(--ink-600)', border: discreto ? '1px solid #dfe9e2' : 'none',
        }}
      >
        {titulo}
        <span style={{ display: 'flex', transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}><IconAbajo size={22} /></span>
      </button>
      {abierto && <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>{children}</div>}
    </div>
  );
}

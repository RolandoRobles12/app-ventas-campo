import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, type Antecedente, type Prospecto } from '../../api';
import { useSession } from '../../session';
import { CameraCapture } from '../../components/CameraCapture';
import { antecedentesEnCache, cargarAntecedentes, guardarVisitaPendiente, marcarVisitaLocal, prospectosConCache, rutaEnCache } from '../../offline';
import { subirFotos } from '../../uploadFotos';
import { nuevoId, track } from '../../analitica';
import { distanciaMetros, textoDistancia } from '../../ruta';
import { etiquetaDia, fechaLocal, sumarDias } from '../../fechas';
import { RESULTADOS_UI, resultadoUI } from '../../resultados';
import { telHref, textoTelefono } from '../../llamadas';
import { evaluarZona, useZonasRestringidas } from '../../zonas';
import { AvisoZona } from '../../components/AvisoZona';
import { useConfigApp } from '../../configApp';
import { PENDIENTE, SelectorSolicitud } from '../../components/SelectorSolicitud';
import { IconAtras, IconCamara, IconCheck, IconInfo, IconMas, IconNavegar, IconPin, IconTelefono, IconX } from '../../icons';

const GIROS = ['Abarrotes', 'Ferretería', 'Papelería', 'Alimentos', 'Belleza', 'Taller', 'Servicios', 'Otro'];
// Mismo tope que MAX_FOTOS_POR_VISITA en server/src/routes/visitas.ts (el
// servidor es quien lo hace cumplir; este solo es para la interfaz).
const MAX_FOTOS = 5;
// "Cerrado o no existe" se registra desde donde sea: no hay a qué acercarse.
const NO_VALIDO = 'No es un negocio válido o existente';
const SOLICITUD = 'Se realizó solicitud';
const REAGENDA = 'Se reagenda visita';
const NOTAS_RAPIDAS = ['No estaba el dueño', 'Pidió que regrese', 'Ya tiene crédito', 'Lo va a pensar', 'Negocio cerrado hoy'];

// Negocio de mentira para la visita de práctica del onboarding: nada de lo
// que se capture con él se envía ni se guarda.
const NEGOCIO_PRACTICA: Prospecto = {
  id: 'practica', vendedorId: '', nombre: 'Abarrotes La Práctica', direccion: 'Negocio de ejemplo', giro: 'Abarrotes',
  telefono: null, origen: 'practica', estado: 'por_visitar',
};

type GpsFix = { lat: number; lng: number; accuracy: number };
type GpsState = { status: 'buscando' } | { status: 'ok'; fix: GpsFix } | { status: 'error'; message: string };

function useGps(): GpsState {
  const [gps, setGps] = useState<GpsState>({ status: 'buscando' });
  useEffect(() => {
    if (!('geolocation' in navigator)) {
      setGps({ status: 'error', message: 'Este dispositivo no tiene GPS disponible' });
      return;
    }
    // watchPosition en lugar de getCurrentPosition: el primer fix suele ser burdo
    // (por red) y los siguientes lo van afinando mientras se llena el formulario.
    const watchId = navigator.geolocation.watchPosition(
      (pos) => setGps({ status: 'ok', fix: { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Math.round(pos.coords.accuracy) } }),
      (err) => setGps((prev) => (prev.status === 'ok' ? prev : {
        status: 'error',
        message: err.code === err.PERMISSION_DENIED ? 'Permiso de ubicación denegado' : 'No se pudo obtener tu ubicación',
      })),
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);
  return gps;
}

export function RegistrarVisita({ nueva = false, practica = false }: { nueva?: boolean; practica?: boolean }) {
  const { vendedor } = useSession();
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const gps = useGps();
  const zonas = useZonasRestringidas(vendedor?.id);
  const { radioCercoMetros: radio } = useConfigApp();
  // "El negocio está en otro lugar": deja registrar fuera del cerco y manda
  // su ubicación para que el líder la revise.
  const [otroLugar, setOtroLugar] = useState(false);
  // "Hizo solicitud": cuál de sus solicitudes de HubSpot es (id del deal,
  // PENDIENTE = "todavía no aparece", null = sin elegir).
  const [solicitud, setSolicitud] = useState<string | null>(null);

  // La lista manda el negocio en el estado de navegación: abre al instante y
  // sin depender de la red. El caché es el respaldo si se entra por URL.
  const [prospecto, setProspecto] = useState<Prospecto | null>(() => {
    if (practica) return NEGOCIO_PRACTICA;
    const desdeLista = (location.state as { prospecto?: Prospecto } | null)?.prospecto;
    if (desdeLista || nueva || !vendedor) return desdeLista ?? null;
    return rutaEnCache(vendedor.id)?.find((p) => p.id === id) ?? null;
  });
  const [buscando, setBuscando] = useState(!prospecto && !nueva);
  useEffect(() => {
    if (prospecto || nueva || !vendedor) return;
    prospectosConCache(vendedor.id)
      .then((lista) => setProspecto(lista.find((p) => p.id === id) ?? null))
      .catch(() => {})
      .finally(() => setBuscando(false));
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Qué pasó las veces anteriores en este negocio (de la copia local; si no
  // está, se pide al servidor).
  const [antecedentes, setAntecedentes] = useState<Antecedente[] | null>(null);
  useEffect(() => {
    if (!vendedor || !prospecto || practica) return;
    const enCache = antecedentesEnCache(vendedor.id, prospecto.id);
    setAntecedentes(enCache);
    if (!enCache) cargarAntecedentes(vendedor.id, prospecto.id).then(setAntecedentes);
  }, [vendedor?.id, prospecto?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  const [nombre, setNombre] = useState('');
  const [direccion, setDireccion] = useState('');
  const [giro, setGiro] = useState('');
  const [resultado, setResultado] = useState('');
  const [reagendarPara, setReagendarPara] = useState(() => sumarDias(fechaLocal(), 1));
  const [notas, setNotas] = useState('');
  // Teléfono del negocio: se puede capturar si no tiene o corregir si está mal.
  const [telefono, setTelefono] = useState('');
  const [editarTelefono, setEditarTelefono] = useState(false);
  const [fotos, setFotos] = useState<{ file: File; preview: string }[]>([]);
  const [camara, setCamara] = useState(false);
  const [guardando, setGuardando] = useState(false);
  // Tras el primer intento de guardar, lo que falte se marca en rojo (el botón
  // nunca se deshabilita: un botón apagado sin explicación solo confunde).
  const [intento, setIntento] = useState(false);
  const [error, setError] = useState('');
  const refs = { nombre: useRef<HTMLDivElement>(null), resultado: useRef<HTMLDivElement>(null), foto: useRef<HTMLDivElement>(null) };

  // Libera las vistas previas al salir (con las que haya en ese momento).
  const fotosRef = useRef(fotos);
  fotosRef.current = fotos;
  useEffect(() => () => fotosRef.current.forEach((f) => URL.revokeObjectURL(f.preview)), []);

  // Medición de uso: cada vez que se abre el registro es un intento; sus
  // pasos (resultado, foto, guardar) forman el embudo de "Uso de la app".
  const [intentoId] = useState(nuevoId);
  const paso = (nombre: string, datos: Record<string, string | number | boolean | undefined> = {}) =>
    track(nombre, { intento: intentoId, ...(practica ? { practica: true } : {}), ...datos });
  useEffect(() => { paso('visita_abierta', { tipo: nueva ? 'nuevo' : 'ruta' }); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!vendedor) return null;
  if (!nueva && !prospecto && buscando) return <div style={{ padding: 28, textAlign: 'center', color: '#6f7d75', fontWeight: 600 }}>Cargando…</div>;
  if (!nueva && !prospecto) {
    return (
      <div style={{ padding: 28, textAlign: 'center' }}>
        <p style={{ fontSize: 16, color: '#6f7d75', fontWeight: 600 }}>No encontramos este negocio en tu ruta.</p>
        <button className="btn btn-primary tap" onClick={() => navigate('/')}>Volver a mi ruta</button>
      </div>
    );
  }

  // Donde no puede ir, no se registra (el servidor también lo rechaza). En
  // el borde, con GPS impreciso, solo se advierte.
  const enZona = !practica && gps.status === 'ok' ? evaluarZona(gps.fix, zonas) : null;
  const bloqueada = enZona?.estado === 'dentro';

  const faltaNombre = nueva && !nombre.trim();
  const faltaResultado = !resultado;
  const faltaFoto = fotos.length === 0;
  const pideSolicitud = resultado === SOLICITUD && !practica;
  const faltaSolicitud = pideSolicitud && !solicitud;
  const faltantes = [faltaNombre && 'nombre', faltaResultado && 'resultado', faltaSolicitud && 'cuál solicitud', faltaFoto && 'foto'].filter(Boolean) as string[];

  // Cerco: un negocio de su ruta con ubicación conocida (del DENUE, o de
  // cuando lo registraron en la calle) solo se registra estando a `radio`
  // metros o menos, con un GPS así de preciso. El servidor aplica lo mismo.
  const conReferencia = !nueva && !practica && prospecto?.lat != null && prospecto?.lng != null;
  const distanciaNegocio = gps.status === 'ok' && conReferencia ? distanciaMetros(gps.fix, { lat: prospecto!.lat!, lng: prospecto!.lng! }) : null;
  const cerco: EstadoCerco = !conReferencia ? 'sin_referencia'
    : resultado === NO_VALIDO ? 'exento'
      : gps.status === 'buscando' ? 'buscando'
        : gps.status === 'error' ? 'sin_gps'
          : distanciaNegocio! > radio ? 'lejos'
            : gps.fix.accuracy > radio ? 'impreciso' : 'ok';
  const fueraDeCerco = ['buscando', 'sin_gps', 'impreciso', 'lejos'].includes(cerco) && !(cerco === 'lejos' && otroLugar);
  const textoBloqueo: Record<string, string> = {
    buscando: 'Buscando tu ubicación…', sin_gps: 'Activa tu ubicación para registrar',
    impreciso: 'Esperando un GPS más preciso', lejos: 'Acércate al negocio para registrar',
  };

  const tomarFoto = (file: File) => {
    paso('visita_foto', { fotos: fotos.length + 1 });
    setFotos((prev) => [...prev, { file, preview: URL.createObjectURL(file) }]);
    setCamara(false);
  };

  const agregarNota = (n: string) => setNotas((prev) => (prev.includes(n) ? prev : prev ? `${prev.trim()}. ${n}` : n));

  const guardar = async () => {
    paso('visita_guardar');
    if (bloqueada) {
      paso('visita_bloqueada', { motivo: 'zona' });
      setError('Estás en una zona donde no puedes visitar negocios: esta visita no se puede registrar aquí.');
      return;
    }
    if (fueraDeCerco) {
      paso('visita_bloqueada', { motivo: cerco, ...(distanciaNegocio != null ? { metros: Math.round(distanciaNegocio) } : {}) });
      setError(cerco === 'lejos' ? `Estás a ${textoDistancia(distanciaNegocio)} del negocio: acércate a menos de ${radio} m para registrar la visita.`
        : cerco === 'impreciso' ? 'Tu GPS no es preciso ahora. Sal a la calle o espera unos segundos.'
          : cerco === 'sin_gps' ? 'Necesitamos tu ubicación para registrar la visita. Revisa que esté encendida.'
            : 'Espera a que encontremos tu ubicación.');
      return;
    }
    if (faltantes.length) {
      paso('visita_bloqueada', { motivo: 'faltantes', falta: faltantes.join(', ') });
      setIntento(true);
      setError('');
      const primero = faltaNombre ? refs.nombre : faltaResultado || faltaSolicitud ? refs.resultado : refs.foto;
      primero.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
    setGuardando(true);
    setError('');

    const nombreNegocio = nueva ? nombre.trim() : prospecto!.nombre;
    if (practica) {
      paso('visita_guardada', { resultado });
      setGuardando(false);
      navigate('/visita/exito', { replace: true, state: { nombre: nombreNegocio, resultado, fotos: fotos.length, practica: true, reagendarPara: resultado === REAGENDA ? reagendarPara : null } });
      return;
    }
    const campos: Record<string, string> = { vendedorId: vendedor.id, resultado, nombreNegocio };
    if (notas.trim()) campos.notas = notas.trim();
    if (telefono.trim()) campos.telefono = telefono.trim();
    if (gps.status === 'ok') {
      campos.lat = String(gps.fix.lat);
      campos.lng = String(gps.fix.lng);
      campos.gpsAccuracy = String(gps.fix.accuracy);
    }
    if (nueva) {
      campos.esNegocioNuevo = 'true';
      campos.direccion = direccion.trim() || 'Ubicación actual';
      if (giro) campos.giro = giro;
    } else {
      campos.prospectoId = prospecto!.id;
      campos.direccion = prospecto!.direccion;
      if (resultado === REAGENDA) campos.reagendarPara = reagendarPara;
      if (cerco === 'lejos' && otroLugar) campos.negocioEnOtroLugar = 'true';
    }
    if (pideSolicitud && solicitud && solicitud !== PENDIENTE) campos.dealId = solicitud;
    // Un negocio nuevo también puede quedar para otro día (entra a su ruta).
    if (nueva && resultado === REAGENDA) campos.reagendarPara = reagendarPara;
    const capturadoEn = Date.now();

    // Cómo quedó la solicitud: ligada, o sin ligar (y por qué).
    const terminar = (pendiente: boolean, duplicado: string | null = null, estadoSolicitud: string | null = pideSolicitud ? (solicitud === PENDIENTE ? 'pendiente' : 'ligada') : null) => {
      paso('visita_guardada', { resultado, sinSenal: pendiente, fotos: fotos.length });
      if (!nueva) {
        marcarVisitaLocal(vendedor.id, prospecto!.id, resultado === REAGENDA
          ? { estado: 'por_visitar', fechaPlan: reagendarPara, reagendado: true }
          : { estado: 'visitado' });
      }
      navigate('/visita/exito', { replace: true, state: { nombre: nombreNegocio, resultado, fotos: fotos.length, pendiente, duplicado, solicitud: estadoSolicitud, reagendarPara: resultado === REAGENDA ? reagendarPara : null } });
    };

    // Sin señal, la visita no se pierde: queda en la tablet (IndexedDB) y
    // OfflineSync la envía en cuanto haya conexión.
    const encolar = async () => {
      await guardarVisitaPendiente({ campos, fotos: fotos.map((f) => f.file), nombreNegocio, capturadoEn });
      terminar(true);
    };

    try {
      if (!navigator.onLine) {
        await encolar();
        return;
      }
      const urls = await subirFotos(vendedor.id, fotos.map((f) => f.file));
      const r = await api.registrarVisita({ ...campos, capturadoEn, fotos: urls });
      terminar(false, r.duplicado ?? null, !pideSolicitud ? null : r.solicitud?.ok ? 'ligada' : r.solicitud ? r.solicitud.motivo : 'pendiente');
    } catch (err) {
      if (err instanceof ApiError) {
        paso('visita_bloqueada', { motivo: 'rechazada', estado: err.status });
        setError(err.message);
      } else {
        // fetch tronó a mitad del envío: es falta de red, no un rechazo
        await encolar().catch(() => {
          paso('visita_bloqueada', { motivo: 'error' });
          setError('No se pudo guardar la visita. Intenta de nuevo.');
        });
      }
    } finally {
      setGuardando(false);
    }
  };

  const hoy = fechaLocal();
  const opcionesReagenda = [sumarDias(hoy, 1), sumarDias(hoy, 2), sumarDias(hoy, 7)];

  return (
    <div style={{ minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
      <header style={{ position: 'sticky', top: 0, zIndex: 5, background: '#eef5f0', borderBottom: '1px solid #dfe9e2' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px' }}>
          <button onClick={() => (location.key !== 'default' ? navigate(-1) : navigate('/'))} aria-label="Regresar" className="tap" style={{ width: 52, height: 52, borderRadius: 16, background: '#fff', border: '1px solid #dfe9e2', display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <IconAtras size={26} stroke={2.6} />
          </button>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '1px', color: practica ? '#c96a1e' : '#6f7d75' }}>{practica ? 'VISITA DE PRÁCTICA' : nueva ? 'NEGOCIO NUEVO' : 'REGISTRAR VISITA'}</div>
            <div className="ellipsis" style={{ fontSize: 21, fontWeight: 800, color: 'var(--ink-900)' }}>{nueva ? (nombre.trim() || 'Negocio fuera de ruta') : prospecto!.nombre}</div>
          </div>
        </div>
      </header>

      <div style={{ flex: 1, width: '100%', maxWidth: 860, margin: '0 auto', padding: '16px 16px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
        {enZona && <AvisoZona estado={enZona.estado} mensaje={enZona.zona.mensaje} />}
        {practica && (
          <section style={{ display: 'flex', gap: 12, alignItems: 'flex-start', background: '#fdf4e7', border: '2px solid #f6d6b3', borderRadius: 18, padding: 16 }}>
            <span style={{ flex: 'none', color: '#c96a1e', display: 'flex', marginTop: 1 }}><IconInfo size={24} /></span>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#6b4413', lineHeight: 1.5 }}>
              <b>Esto es una práctica:</b> nada se guarda ni cuenta para tu meta. Haz lo mismo que en una visita real:
              elige cómo te fue, toma una foto (de lo que sea) y toca "Guardar visita".
            </div>
          </section>
        )}

        {!nueva && prospecto && (
          <section className="card" data-zona="Datos del negocio" style={{ padding: 16 }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 15, fontWeight: 600, color: '#3a4a41', lineHeight: 1.45 }}>
              <span style={{ color: '#15915c', flex: 'none', marginTop: 1 }}><IconPin size={20} /></span>
              <span>{[prospecto.giro, prospecto.direccion].filter(Boolean).join(' · ')}</span>
            </div>
            {!practica && <div style={{ display: 'flex', gap: 10, marginTop: 14, flexWrap: 'wrap' }}>
              <button className="btn btn-ghost tap" style={{ flex: 1, minWidth: 160 }} onClick={() => navigate(`/llegar/${prospecto.id}`, { state: { prospecto, desdeVisita: true } })}>
                <IconNavegar size={20} stroke={2.4} /> Cómo llegar
              </button>
              {prospecto.telefono && !prospecto.telefonoInvalido && (
                <a href={telHref(prospecto.telefono)} className="btn btn-ghost tap" style={{ flex: 1, minWidth: 160, textDecoration: 'none' }}>
                  <IconTelefono size={20} /> Llamar
                </a>
              )}
            </div>}
            {!practica && (prospecto.telefono && !prospecto.telefonoInvalido && !editarTelefono ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12, fontSize: 14, fontWeight: 600, color: '#5a665f' }}>
                <span className="rr-mask">Tel. {textoTelefono(prospecto.telefono)}</span>
                <button className="tap" onClick={() => setEditarTelefono(true)} style={{ fontSize: 14, fontWeight: 800, color: 'var(--aviva-green-700)', padding: '6px 4px' }}>¿Está mal? Corrígelo</button>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--ink-800)', marginBottom: 8 }}>
                  {prospecto.telefono && !prospecto.telefonoInvalido ? 'Teléfono correcto' : '¿Tienes su teléfono?'} <span style={{ fontWeight: 600, color: '#8a978f' }}>(opcional)</span>
                </div>
                <input className="field" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Así podrás llamarle para agendar la próxima visita" />
              </div>
            ))}
            <Cerco
              estado={cerco} gps={gps} distancia={distanciaNegocio} radio={radio} otroLugar={otroLugar} setOtroLugar={setOtroLugar}
              comoLlegar={() => navigate(`/llegar/${prospecto.id}`, { state: { prospecto, desdeVisita: true } })}
            />
          </section>
        )}

        {!nueva && antecedentes && antecedentes.length > 0 && <VisitadoAntes antecedentes={antecedentes} />}

        {nueva && (
          <section className="card" data-zona="Datos del negocio nuevo" style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div ref={refs.nombre}>
              <Etiqueta falta={intento && faltaNombre} aviso="escribe el nombre">Nombre del negocio</Etiqueta>
              <input className="field" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Tortillería La Espiga" style={intento && faltaNombre ? { borderColor: '#e29a90' } : undefined} />
            </div>
            <div>
              <Etiqueta>Giro</Etiqueta>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {GIROS.map((g) => (
                  <button key={g} className="chip tap" aria-pressed={giro === g} onClick={() => setGiro(giro === g ? '' : g)}>{g}</button>
                ))}
              </div>
            </div>
            <div>
              <Etiqueta>Dirección o referencia <span style={{ fontWeight: 600, color: '#8a978f' }}>(opcional)</span></Etiqueta>
              <input className="field" value={direccion} onChange={(e) => setDireccion(e.target.value)} placeholder="Si la dejas vacía, usamos tu ubicación GPS" />
            </div>
            <div>
              <Etiqueta>Teléfono <span style={{ fontWeight: 600, color: '#8a978f' }}>(opcional)</span></Etiqueta>
              <input className="field" type="tel" inputMode="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} placeholder="Para llamarle y agendar la próxima visita" />
            </div>
            <Ubicacion gps={gps} distancia={null} />
          </section>
        )}

        <section ref={refs.resultado} className="card" data-zona="Cómo te fue" style={{ padding: 18 }}>
          <Etiqueta falta={intento && faltaResultado} aviso="elige una opción">¿Cómo te fue?</Etiqueta>
          <div className="resultados-grid">
            {RESULTADOS_UI.map((r) => {
              const activo = resultado === r.valor;
              return (
                <button
                  key={r.valor}
                  className="tap"
                  onClick={() => { setResultado(r.valor); if (r.valor !== resultado) paso('visita_resultado', { resultado: r.valor }); }}
                  aria-pressed={activo}
                  style={{
                    minHeight: 84, borderRadius: 16, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
                    border: `2.5px solid ${activo ? r.color : intento && faltaResultado ? '#f0b9b0' : '#e2eae4'}`,
                    background: activo ? r.fondo : '#fafcfa',
                  }}
                >
                  <span style={{ flex: 'none', width: 44, height: 44, borderRadius: 12, background: activo ? '#fff' : r.fondo, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <r.Icon size={24} />
                  </span>
                  <span style={{ flex: 1, fontSize: 16, fontWeight: 800, color: activo ? r.color : 'var(--ink-600)', lineHeight: 1.25 }}>{r.etiqueta}</span>
                  {activo && <span style={{ color: r.color }}><IconCheck size={22} stroke={3} /></span>}
                </button>
              );
            })}
          </div>

          {pideSolicitud && <SelectorSolicitud vendedorId={vendedor.id} valor={solicitud} onChange={setSolicitud} />}

          {resultado === REAGENDA && (
            <div className="aparecer" style={{ marginTop: 16, background: '#f2f7fd', borderRadius: 16, padding: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: '#1d5fae', marginBottom: 10 }}>¿Cuándo regresas?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {opcionesReagenda.map((f, i) => (
                  <button key={f} className="chip tap" aria-pressed={reagendarPara === f} onClick={() => setReagendarPara(f)}>
                    {i === 2 ? 'En una semana' : etiquetaDia(f, hoy)}
                  </button>
                ))}
                <input
                  type="date" className="field" min={sumarDias(hoy, 1)} value={reagendarPara}
                  onChange={(e) => e.target.value && setReagendarPara(e.target.value)}
                  style={{ width: 'auto', minHeight: 44, padding: '8px 12px' }}
                />
              </div>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#4a6a8f', marginTop: 10 }}>El negocio vuelve a tu ruta ese día.</div>
            </div>
          )}
        </section>

        <section ref={refs.foto} className="card" data-zona="Fotos" style={{ padding: 18 }}>
          <Etiqueta falta={intento && faltaFoto} aviso="toma al menos una">
            Foto de evidencia {fotos.length > 0 && <span style={{ color: '#8a978f', fontWeight: 600 }}>({fotos.length}/{MAX_FOTOS})</span>}
          </Etiqueta>
          {fotos.length === 0 ? (
            <button
              className="tap"
              onClick={() => setCamara(true)}
              style={{
                width: '100%', minHeight: 150, borderRadius: 16, border: `2.5px dashed ${intento && faltaFoto ? '#e29a90' : '#b7cabf'}`,
                background: '#fafcfa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
              }}
            >
              <span style={{ width: 62, height: 62, borderRadius: '50%', background: 'var(--aviva-green-700)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <IconCamara size={30} />
              </span>
              <span style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink-800)' }}>Tomar foto</span>
            </button>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 10 }}>
              {fotos.map((f, i) => (
                <div key={f.preview} style={{ position: 'relative', aspectRatio: '1', borderRadius: 14, overflow: 'hidden', backgroundImage: `url(${f.preview})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
                  <button
                    onClick={() => setFotos((prev) => prev.filter((_, j) => j !== i))}
                    aria-label="Quitar foto"
                    className="tap"
                    style={{ position: 'absolute', top: 6, right: 6, width: 40, height: 40, borderRadius: '50%', background: 'rgba(0,0,0,.6)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    <IconX size={20} stroke={2.8} />
                  </button>
                </div>
              ))}
              {fotos.length < MAX_FOTOS && (
                <button className="tap" onClick={() => setCamara(true)} style={{ aspectRatio: '1', borderRadius: 14, border: '2.5px dashed #b7cabf', background: '#fafcfa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, color: 'var(--aviva-green-700)' }}>
                  <IconMas size={26} stroke={2.6} />
                  <span style={{ fontSize: 14, fontWeight: 800 }}>Otra foto</span>
                </button>
              )}
            </div>
          )}
        </section>

        <section className="card" data-zona="Notas" style={{ padding: 18 }}>
          <Etiqueta>Notas <span style={{ fontWeight: 600, color: '#8a978f' }}>(opcional)</span></Etiqueta>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 12 }}>
            {NOTAS_RAPIDAS.map((n) => (
              <button key={n} className="chip tap" aria-pressed={notas.includes(n)} onClick={() => agregarNota(n)}>{n}</button>
            ))}
          </div>
          <textarea className="field" value={notas} onChange={(e) => setNotas(e.target.value)} placeholder="Algo que quieras recordar de esta visita…" rows={3} style={{ resize: 'none' }} />
        </section>
      </div>

      <footer style={{ position: 'sticky', bottom: 0, zIndex: 5, background: '#fff', borderTop: '1px solid #dfe9e2', padding: '12px 16px' }}>
        <div style={{ maxWidth: 860, margin: '0 auto' }}>
          {error && <div style={{ color: '#b23a2b', fontSize: 15, fontWeight: 700, marginBottom: 10 }}>{error}</div>}
          <button
            onClick={guardar}
            disabled={guardando}
            className="btn tap"
            style={{ width: '100%', minHeight: 62, fontSize: 19, background: bloqueada || fueraDeCerco ? '#c9a39d' : faltantes.length ? '#9fb5a8' : 'var(--aviva-green-700)', color: '#fff' }}
          >
            {guardando ? 'Guardando…' : bloqueada ? 'No puedes registrar visitas en esta zona' : fueraDeCerco ? textoBloqueo[cerco] : faltantes.length ? `Falta: ${faltantes.join(', ')}` : <><IconCheck size={24} stroke={3} /> {practica ? 'Guardar visita (práctica)' : 'Guardar visita'}</>}
          </button>
        </div>
      </footer>

      {camara && <CameraCapture onCapture={tomarFoto} onClose={() => setCamara(false)} />}
    </div>
  );
}

function Etiqueta({ children, falta = false, aviso }: { children: React.ReactNode; falta?: boolean; aviso?: string }) {
  return (
    <div style={{ fontSize: 17, fontWeight: 800, color: falta ? '#b23a2b' : 'var(--ink-800)', marginBottom: 12 }}>
      {children} {falta && aviso && <span style={{ fontSize: 15, fontWeight: 700 }}>· {aviso}</span>}
    </div>
  );
}

function VisitadoAntes({ antecedentes }: { antecedentes: Antecedente[] }) {
  return (
    <section className="card" style={{ padding: 16 }}>
      <div style={{ fontSize: 13, fontWeight: 800, letterSpacing: '1px', color: '#6f7d75', marginBottom: 10 }}>VISITADO ANTES</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {antecedentes.map((a, i) => {
          const r = resultadoUI(a.resultado);
          return (
            <div key={i} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <span style={{ flex: 'none', width: 38, height: 38, borderRadius: 12, background: r.fondo, color: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <r.Icon size={20} />
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontSize: 15, fontWeight: 800, color: r.color }}>{r.etiqueta}</div>
                <div style={{ fontSize: 14, fontWeight: 600, color: '#5a665f', marginTop: 1 }}>
                  {a.fecha ? etiquetaDia(fechaLocal(new Date(a.fecha))) : ''} · {a.propia ? 'Tú' : a.vendedorNombre}
                </div>
                {a.notas && <div style={{ fontSize: 14, color: '#3a4a41', marginTop: 4, lineHeight: 1.4 }}>&ldquo;{a.notas}&rdquo;</div>}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

// Ubicación del vendedor al registrar un negocio nuevo (su GPS será la
// ubicación del negocio).
function Ubicacion({ gps }: { gps: GpsState; distancia?: null }) {
  let fondo = '#eef5f0', color = '#356048', texto: string;
  if (gps.status === 'buscando') {
    fondo = '#fdf4e7'; color = '#8a5a1e'; texto = 'Buscando tu ubicación GPS…';
  } else if (gps.status === 'error') {
    fondo = '#fdecea'; color = '#8f3025'; texto = gps.message;
  } else {
    texto = `Ubicación capturada · precisión ±${gps.fix.accuracy} m`;
  }
  return <Franja fondo={fondo} color={color}>{texto}</Franja>;
}

type EstadoCerco = 'sin_referencia' | 'exento' | 'buscando' | 'sin_gps' | 'impreciso' | 'lejos' | 'ok';

// Dónde está el vendedor respecto al negocio. Fuera del cerco no se puede
// guardar: se le dice qué hacer (acercarse, mejorar el GPS) y, si el negocio
// en realidad está en otro lugar, puede decirlo para que su líder lo revise.
function Cerco({ estado, gps, distancia, radio, otroLugar, setOtroLugar, comoLlegar }: {
  estado: EstadoCerco; gps: GpsState; distancia: number | null; radio: number;
  otroLugar: boolean; setOtroLugar: (v: boolean) => void; comoLlegar: () => void;
}) {
  if (estado === 'sin_referencia') {
    return <Franja fondo="#f2f5f2" color="#5a665f">Este negocio no tiene ubicación registrada: la visita queda sin comprobar.</Franja>;
  }
  if (estado === 'exento') {
    return <Franja fondo="#f2f5f2" color="#5a665f">"Cerrado o no existe" se puede registrar desde donde estés.</Franja>;
  }
  if (estado === 'ok') {
    return <Franja fondo="#dcf1e5" color="#15703f">Estás en el negocio (a {textoDistancia(distancia)}) · ya puedes registrar la visita</Franja>;
  }
  if (estado === 'buscando') return <Franja fondo="#fdf4e7" color="#8a5a1e">Buscando tu ubicación GPS…</Franja>;
  if (estado === 'sin_gps') {
    return <Franja fondo="#fdecea" color="#8f3025">{gps.status === 'error' ? gps.message : 'Sin ubicación'}: actívala para registrar la visita.</Franja>;
  }
  if (estado === 'impreciso') {
    return (
      <Franja fondo="#fdf4e7" color="#8a5a1e">
        Tu GPS no es preciso ahora (±{gps.status === 'ok' ? gps.fix.accuracy : '?'} m). Sal a la calle o espera unos segundos: se actualiza solo.
      </Franja>
    );
  }
  // Lejos del negocio.
  return (
    <div style={{ marginTop: 14, background: otroLugar ? '#f2f7fd' : '#fdecea', border: `2px solid ${otroLugar ? '#bcd3f0' : '#f0c0b8'}`, borderRadius: 14, padding: 14 }}>
      {otroLugar ? (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#1d5fae' }}>El negocio está en otro lugar</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#3a4a41', marginTop: 4, lineHeight: 1.45 }}>
            Guardaremos tu ubicación actual como la del negocio y tu líder la revisará.
          </div>
          <button className="tap" onClick={() => setOtroLugar(false)} style={{ marginTop: 8, fontSize: 14, fontWeight: 800, color: '#1d5fae', padding: '6px 0' }}>No, me equivoqué</button>
        </>
      ) : (
        <>
          <div style={{ fontSize: 15, fontWeight: 800, color: '#8f3025' }}>Estás a {textoDistancia(distancia)} del negocio</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: '#5a3a35', marginTop: 4, lineHeight: 1.45 }}>
            Acércate a menos de {radio} m para registrar la visita.
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button className="btn btn-primary tap" onClick={comoLlegar} style={{ flex: 1, minWidth: 150, minHeight: 50, fontSize: 16 }}>
              <IconNavegar size={18} stroke={2.4} /> Cómo llegar
            </button>
            <button className="btn btn-ghost tap" onClick={() => setOtroLugar(true)} style={{ flex: 1, minWidth: 150, minHeight: 50, fontSize: 15 }}>
              El negocio está en otro lugar
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function Franja({ fondo, color, children }: { fondo: string; color: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: fondo, color, borderRadius: 12, padding: '11px 13px', marginTop: 14, fontSize: 14, fontWeight: 700, lineHeight: 1.35 }}>
      <span style={{ flex: 'none', display: 'flex' }}><IconPin size={18} /></span>
      <span>{children}</span>
    </div>
  );
}

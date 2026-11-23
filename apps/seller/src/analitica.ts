import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { api, ApiError } from './api';

// Medición de uso de la app (lo ve el admin en "Uso de la app"): qué
// pantallas abre el vendedor y cuánto tiempo, qué toca y dónde, cuándo toca
// varias veces seguidas en el mismo lugar (frustración) o en algo que no
// hace nada, los errores, los ratos sin señal y los pasos de registrar una
// visita o una llamada.
//
// Nunca se guarda lo que escribe: de un campo de texto solo se sabe cuál
// fue, no su contenido. Los eventos se juntan aquí, se guardan en la tablet
// (para no perderlos sin señal) y se mandan en lotes cada minuto.
//
// La grabación de sesiones (grabacion.ts) escucha estos mismos eventos para
// marcar en su línea de tiempo dónde hubo toques de frustración o errores.

export type TipoEvento = 'app' | 'pantalla' | 'tiempo' | 'toque' | 'accion' | 'error' | 'red';
export interface Evento {
  t: number; k: TipoEvento; p: string;
  o?: string; x?: number; y?: number; ms?: number; r?: 1; m?: 1; n?: string;
  d?: Record<string, string | number | boolean>;
}

interface LotePendiente { vendedorId: string; sesionId: string; eventos: Evento[] }

const COLA_KEY = 'aviva.analitica.cola';
const MAX_EVENTOS_COLA = 4000;
const MAX_EVENTOS_LOTE = 400;
const ENVIAR_CADA_MS = 60 * 1000;
const GUARDAR_CADA_MS = 15 * 1000;
// Si la app estuvo en segundo plano más de esto, al volver es otra sesión.
const SESION_INACTIVA_MS = 30 * 60 * 1000;
// Más de esto en una pantalla casi siempre es la tablet prendida sin usar.
const MAX_MS_PANTALLA = 10 * 60 * 1000;
// Toques de frustración: 3 o más en menos de 1 s, a menos de 40 px.
const RABIA_VENTANA_MS = 1000;
const RABIA_RADIO_PX = 40;

const INTERACTIVO = 'button, a, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="link"], [role="option"], [data-track]';

export function nuevoId(): string {
  try { return crypto.randomUUID(); } catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`; }
}

// ——— Estado de la sesión ———

let vendedorActual: string | null = null;
let sesionId = nuevoId();
let iniciada = false;
let buffer: Evento[] = [];
let ruta = '/';
const modales: string[] = [];
let pantallaDesde = Date.now();
let visible = typeof document === 'undefined' ? true : document.visibilityState === 'visible';
let ocultaDesde = 0;
let sinSenalDesde = 0;
let toquesRecientes: { t: number; x: number; y: number }[] = [];
const oyentes = new Set<(e: Evento) => void>();
const oyentesSesion = new Set<(id: string) => void>();

export const sesionActual = () => sesionId;

// Nombre legible de cada pantalla (sin ids, para poder agruparlas).
export function nombrePantalla(path: string): string {
  if (path === '/' || path === '') return 'Mi ruta';
  if (path === '/mapa') return 'Mapa';
  if (path === '/historial') return 'Historial';
  if (path === '/visita/nueva') return 'Visita a negocio nuevo';
  if (path === '/visita/practica') return 'Visita de práctica';
  if (path === '/visita/exito') return 'Visita guardada';
  if (path.startsWith('/visita/')) return 'Registrar visita';
  if (path.startsWith('/llegar/')) return 'Cómo llegar';
  return path.slice(0, 40);
}

export const pantallaActual = () => modales[modales.length - 1] ?? nombrePantalla(ruta);

function emitir(e: Omit<Evento, 't' | 'p'> & { t?: number; p?: string }) {
  if (!vendedorActual) return;
  const ev: Evento = { t: Date.now(), p: pantallaActual(), ...e } as Evento;
  buffer.push(ev);
  oyentes.forEach((f) => { try { f(ev); } catch { /* un oyente roto no tumba la medición */ } });
}

// Cierra el rato en la pantalla actual (al cambiar de pantalla o al dejar
// la app en segundo plano).
function cerrarTiempo() {
  const ahora = Date.now();
  const ms = Math.min(ahora - pantallaDesde, MAX_MS_PANTALLA);
  if (visible && ms >= 300) emitir({ k: 'tiempo', ms });
  pantallaDesde = ahora;
}

// ——— API para el resto de la app ———

// Un paso de una tarea (p. ej. 'visita_foto'). `intento` agrupa los pasos de
// una misma visita o llamada para el embudo.
export function track(nombre: string, datos?: Record<string, string | number | boolean | null | undefined>) {
  const d: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(datos ?? {})) if (v !== null && v !== undefined) d[k] = v;
  emitir({ k: 'accion', n: nombre, ...(Object.keys(d).length ? { d } : {}) });
}

export function onEvento(f: (e: Evento) => void): () => void {
  oyentes.add(f);
  return () => { oyentes.delete(f); };
}

export function onNuevaSesion(f: (id: string) => void): () => void {
  oyentesSesion.add(f);
  return () => { oyentesSesion.delete(f); };
}

// Pantallas que se abren encima de otra sin cambiar de URL (la cámara, la
// hoja de una llamada, la bienvenida): mientras están abiertas, los toques y
// el tiempo cuentan para ellas.
export function usePantallaModal(nombre: string, activa = true) {
  useEffect(() => {
    if (!activa) return;
    cerrarTiempo();
    modales.push(nombre);
    emitir({ k: 'pantalla' });
    return () => {
      cerrarTiempo();
      const i = modales.lastIndexOf(nombre);
      if (i >= 0) modales.splice(i, 1);
    };
  }, [nombre, activa]);
}

// Registra la pantalla de cada cambio de ruta. Va dentro del Router.
let rutaEmitida: string | null = null;
export function MedicionPantallas(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    if (pathname === rutaEmitida) return;
    cerrarTiempo();
    ruta = pathname;
    rutaEmitida = pathname;
    emitir({ k: 'pantalla' });
  }, [pathname]);
  return null;
}

// ——— Toques ———

function etiquetaDe(el: Element | null): string {
  if (!el) return '(sin nombre)';
  const propia = el.getAttribute('data-track') || el.getAttribute('aria-label') || el.getAttribute('title');
  if (propia) return propia.slice(0, 60);
  const tag = el.tagName.toLowerCase();
  if (tag === 'input' || tag === 'select' || tag === 'textarea') {
    // Nunca el valor: solo de qué campo se trata.
    const f = el as HTMLInputElement;
    const etiqueta = f.labels?.[0]?.textContent || f.placeholder || f.name || f.type || tag;
    return `Campo: ${etiqueta.replace(/\s+/g, ' ').trim().slice(0, 40)}`;
  }
  const texto = (el.textContent || '').replace(/\s+/g, ' ').trim().replace(/\d/g, '#');
  const grupo = el.parentElement?.closest('[data-track]')?.getAttribute('data-track');
  if (texto) return texto.length > 40 ? `${texto.slice(0, 40)}…` : texto;
  return grupo ? grupo.slice(0, 60) : tag;
}

function alTocar(ev: MouseEvent) {
  if (!ev.isTrusted || !vendedorActual) return;
  const el = ev.target instanceof Element ? ev.target : null;
  if (!el) return;
  const interactivo = el.closest(INTERACTIVO);
  let muerto = false;
  if (!interactivo) {
    try { muerto = getComputedStyle(el).cursor !== 'pointer'; } catch { muerto = true; }
  }
  // Teclado o click() programático: sin posición.
  const conPosicion = ev.detail > 0 && (ev.clientX > 0 || ev.clientY > 0);
  const ahora = Date.now();
  let rabia = false;
  if (conPosicion) {
    toquesRecientes = toquesRecientes.filter((t) => ahora - t.t < RABIA_VENTANA_MS);
    const cerca = toquesRecientes.filter((t) => Math.hypot(t.x - ev.clientX, t.y - ev.clientY) < RABIA_RADIO_PX);
    rabia = cerca.length >= 2;
    toquesRecientes.push({ t: ahora, x: ev.clientX, y: ev.clientY });
  }
  emitir({
    k: 'toque',
    o: etiquetaDe(interactivo ?? el),
    ...(conPosicion ? { x: ev.clientX / window.innerWidth, y: ev.clientY / window.innerHeight } : {}),
    ...(rabia ? { r: 1 as const } : {}),
    ...(muerto ? { m: 1 as const } : {}),
  });
}

// ——— Dispositivo ———

function dispositivo(): string {
  const ua = navigator.userAgent;
  const android = /Android\s([\d.]+)/.exec(ua);
  if (android) return `Android ${android[1].split('.')[0]}`;
  const ios = /OS (\d+)_\d+.* like Mac OS X/.exec(ua);
  if (ios) return /iPad/.test(ua) ? `iPad iOS ${ios[1]}` : `iPhone iOS ${ios[1]}`;
  if (/Windows/.test(ua)) return 'Windows';
  if (/Mac OS X/.test(ua)) return 'Mac';
  return 'Otro';
}
export const nombreDispositivo = dispositivo;

function eventoInicio() {
  const instalada = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;
  emitir({
    k: 'app', n: 'inicio',
    d: {
      dispositivo: dispositivo(), instalada: !!instalada,
      ancho: window.innerWidth, alto: window.innerHeight, dpr: Math.round((window.devicePixelRatio || 1) * 10) / 10,
      enLinea: navigator.onLine,
    },
  });
}

// ——— Cola y envío ———

function leerCola(): LotePendiente[] {
  try { return JSON.parse(localStorage.getItem(COLA_KEY) || '[]') as LotePendiente[]; } catch { return []; }
}

function escribirCola(cola: LotePendiente[]) {
  // Si no hay señal por días, se quedan los más recientes.
  let total = cola.reduce((s, l) => s + l.eventos.length, 0);
  while (total > MAX_EVENTOS_COLA && cola.length) total -= cola.shift()!.eventos.length;
  try { localStorage.setItem(COLA_KEY, JSON.stringify(cola)); } catch { /* sin espacio: se pierde la medición, no la app */ }
}

// Pasa lo del buffer a la cola guardada en la tablet.
function guardarBuffer() {
  if (!buffer.length || !vendedorActual) return;
  const cola = leerCola();
  const ultimo = cola[cola.length - 1];
  const nuevos = buffer;
  buffer = [];
  if (ultimo && ultimo.sesionId === sesionId && ultimo.vendedorId === vendedorActual && ultimo.eventos.length + nuevos.length <= MAX_EVENTOS_LOTE) {
    ultimo.eventos.push(...nuevos);
  } else {
    for (let i = 0; i < nuevos.length; i += MAX_EVENTOS_LOTE) {
      cola.push({ vendedorId: vendedorActual, sesionId, eventos: nuevos.slice(i, i + MAX_EVENTOS_LOTE) });
    }
  }
  escribirCola(cola);
}

let enviando = false;
export async function enviarAnalitica(): Promise<void> {
  guardarBuffer();
  if (enviando || !navigator.onLine) return;
  enviando = true;
  try {
    let cola = leerCola();
    while (cola.length) {
      try {
        await api.registrarInteracciones(cola[0]);
      } catch (err) {
        // 4xx (menos 401): el servidor nunca lo va a aceptar, se tira.
        if (!(err instanceof ApiError && err.status !== 401 && err.status < 500)) return;
      }
      cola = leerCola().slice(1);
      escribirCola(cola);
    }
  } finally {
    enviando = false;
  }
}

// ——— Arranque ———

function alCambiarVisibilidad() {
  if (document.visibilityState === 'hidden') {
    cerrarTiempo();
    emitir({ k: 'app', n: 'oculta' });
    visible = false;
    ocultaDesde = Date.now();
    guardarBuffer();
    return;
  }
  visible = true;
  pantallaDesde = Date.now();
  if (ocultaDesde && Date.now() - ocultaDesde > SESION_INACTIVA_MS) {
    sesionId = nuevoId();
    eventoInicio();
    emitir({ k: 'pantalla' });
    oyentesSesion.forEach((f) => { try { f(sesionId); } catch { /* nada */ } });
  } else {
    emitir({ k: 'app', n: 'visible', ms: ocultaDesde ? Date.now() - ocultaDesde : undefined });
  }
  enviarAnalitica();
}

function alPerderSenal() {
  sinSenalDesde = Date.now();
  emitir({ k: 'red', n: 'sin_senal' });
}

function alRecuperarSenal() {
  emitir({ k: 'red', n: 'con_senal', ...(sinSenalDesde ? { ms: Date.now() - sinSenalDesde } : {}) });
  sinSenalDesde = 0;
  enviarAnalitica();
}

function mensajeError(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`.slice(0, 200);
  return String(e ?? 'Error').slice(0, 200);
}

function alError(ev: ErrorEvent) {
  // Errores de scripts de otros dominios (Google Maps) llegan sin detalle.
  if (!ev.message || ev.message === 'Script error.') return;
  emitir({ k: 'error', n: mensajeError(ev.error ?? ev.message) });
}

function alRechazo(ev: PromiseRejectionEvent) {
  const r = ev.reason;
  // Fallas de red esperadas (sin señal): no son errores de la app.
  if (r instanceof TypeError && /fetch|network|load failed/i.test(r.message)) return;
  emitir({ k: 'error', n: mensajeError(r) });
}

// Empieza a medir para este vendedor. Se llama una vez por carga de la app.
export function iniciarAnalitica(vendedorId: string): () => void {
  vendedorActual = vendedorId;
  if (iniciada) return () => {};
  iniciada = true;
  pantallaDesde = Date.now();
  eventoInicio();
  if (!navigator.onLine) alPerderSenal();
  document.addEventListener('click', alTocar, true);
  document.addEventListener('visibilitychange', alCambiarVisibilidad);
  window.addEventListener('online', alRecuperarSenal);
  window.addEventListener('offline', alPerderSenal);
  window.addEventListener('error', alError);
  window.addEventListener('unhandledrejection', alRechazo);
  window.addEventListener('pagehide', guardarBuffer);
  const guardar = setInterval(guardarBuffer, GUARDAR_CADA_MS);
  const enviar = setInterval(() => { enviarAnalitica(); }, ENVIAR_CADA_MS);
  // Lo que quedó de la vez anterior.
  setTimeout(() => { enviarAnalitica(); }, 5000);
  return () => {
    cerrarTiempo();
    guardarBuffer();
    document.removeEventListener('click', alTocar, true);
    document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    window.removeEventListener('online', alRecuperarSenal);
    window.removeEventListener('offline', alPerderSenal);
    window.removeEventListener('error', alError);
    window.removeEventListener('unhandledrejection', alRechazo);
    window.removeEventListener('pagehide', guardarBuffer);
    clearInterval(guardar);
    clearInterval(enviar);
    iniciada = false;
    vendedorActual = null;
    rutaEmitida = null;
  };
}

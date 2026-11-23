import { ref, uploadBytes } from 'firebase/storage';
import { auth, storage } from '@aviva/ui';
import { api, ApiError, type Vendedor } from './api';
import { cargarConfig, enCache } from './configApp';
import { fechaLocal } from './fechas';
import { nombreDispositivo, nuevoId, onEvento, onNuevaSesion, pantallaActual, sesionActual, type Evento } from './analitica';

// Grabación de sesiones (como Microsoft Clarity, pero dentro de la app): el
// admin la reproduce en "Uso de la app → Grabaciones". No es video: rrweb
// guarda la estructura de la pantalla y cada cambio, toque y scroll.
//
// Privacidad: todo lo que se escribe en campos de texto va enmascarado
// (****), y las fotos, la cámara y los mapas no se graban (se ve un
// recuadro vacío). Los elementos con la clase `rr-mask` se graban con el
// texto tapado y los de `rr-block` no se graban.
//
// Qué sesiones se graban: las de los vendedores que el admin pidió grabar
// (vendedor.grabarHasta) y un porcentaje al azar del resto (config). La
// grabación se corta en fragmentos de 30 s, se comprime y se guarda en la
// tablet (IndexedDB); se sube cuando hay señal y no está en ahorro de datos.

type RrEvento = { timestamp: number; type: number };
type Record = typeof import('@rrweb/record').record;

const DB_NAME = 'aviva-grabacion';
const STORE = 'fragmentos';
const CORTAR_CADA_MS = 30 * 1000;
const MAX_EVENTOS_FRAGMENTO = 3000;
const MAX_BYTES_FRAGMENTO = 2.8 * 1024 * 1024;
// Tope por sesión y de lo que puede esperar en la tablet sin subirse.
const MAX_BYTES_SESION = 20 * 1024 * 1024;
const MAX_BYTES_COLA = 30 * 1024 * 1024;
const MAX_FRAGMENTOS_SESION = 1400;

interface FragmentoLocal {
  vendedorId: string; sesionId: string; seq: number; inicio: number; fin: number; eventos: number;
  toques: number; rabia: number; muertos: number; errores: number; pantallas: string[];
  motivo: 'pedida' | 'muestreo'; dispositivo: string; bytes: number; blob: Blob;
  // Ya subido a Storage (falta avisar al servidor).
  path?: string;
}

// ——— IndexedDB ———

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { autoIncrement: true });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(modo: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrirDb().then((db) => new Promise<T>((resolve, reject) => {
    const r = fn(db.transaction(STORE, modo).objectStore(STORE));
    r.onsuccess = () => { resolve(r.result); db.close(); };
    r.onerror = () => { reject(r.error); db.close(); };
  }));
}

async function listarCola(): Promise<{ key: IDBValidKey; f: FragmentoLocal }[]> {
  const [keys, values] = await Promise.all([
    tx('readonly', (s) => s.getAllKeys()),
    tx<FragmentoLocal[]>('readonly', (s) => s.getAll()),
  ]);
  return keys.map((key, i) => ({ key, f: values[i] }));
}

async function bytesEnCola(): Promise<number> {
  try { return (await listarCola()).reduce((s, x) => s + x.f.bytes, 0); } catch { return 0; }
}

// ——— Compresión ———

// Los botones "Llamar" llevan el número en el enlace (tel:…): rrweb graba
// los atributos tal cual, así que el número se quita antes de guardar.
export function sinTelefonos(json: string): string {
  return json.replace(/tel:[^"\\]*/g, 'tel:****');
}

async function comprimir(texto: string): Promise<Blob> {
  const stream = new Blob([texto]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).blob();
}

// ——— Estado ———

let record: Record | null = null;
let detenerRecord: (() => void) | undefined;
let activo = false;
let vendedorId = '';
let motivo: 'pedida' | 'muestreo' = 'muestreo';
let sesionGrabada = '';
let seq = 0;
let bytesSesion = 0;
let eventos: RrEvento[] = [];
let stats = { toques: 0, rabia: 0, muertos: 0, errores: 0, pantallas: new Set<string>() };
let cortando: Promise<void> = Promise.resolve();

const reiniciarStats = () => { stats = { toques: 0, rabia: 0, muertos: 0, errores: 0, pantallas: new Set() }; };

export const grabando = () => activo;

function soportado(): boolean {
  return typeof CompressionStream !== 'undefined' && typeof indexedDB !== 'undefined';
}

function ahorroDeDatos(): boolean {
  const c = (navigator as { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
  return !!c && (c.saveData === true || c.effectiveType === 'slow-2g' || c.effectiveType === '2g');
}

function quiereGrabar(v: Vendedor, porcentaje: number): 'pedida' | 'muestreo' | null {
  if (v.grabarHasta && v.grabarHasta >= fechaLocal()) return 'pedida';
  if (porcentaje > 0 && Math.random() * 100 < porcentaje) return 'muestreo';
  return null;
}

// Cierra lo grabado hasta ahora en un fragmento y lo deja en la cola. Lo
// que se corta se toma al momento (antes de comprimir): así una sesión nueva
// que empieza justo después no se mezcla con esta.
function cortarFragmento(): Promise<void> {
  if (!eventos.length) return cortando;
  const lote = eventos;
  eventos = [];
  const datos = {
    vendedorId, sesionId: sesionGrabada, seq: seq++, inicio: lote[0].timestamp, fin: lote[lote.length - 1].timestamp, eventos: lote.length,
    toques: stats.toques, rabia: stats.rabia, muertos: stats.muertos, errores: stats.errores, pantallas: [...stats.pantallas],
    motivo, dispositivo: nombreDispositivo(),
  };
  reiniciarStats();
  cortando = cortando.then(async () => {
    try {
      const blob = await comprimir(sinTelefonos(JSON.stringify(lote)));
      if (blob.size > MAX_BYTES_FRAGMENTO) return;
      if (datos.sesionId === sesionGrabada) bytesSesion += blob.size;
      if (bytesSesion > MAX_BYTES_SESION || datos.seq >= MAX_FRAGMENTOS_SESION || (await bytesEnCola()) + blob.size > MAX_BYTES_COLA) {
        // Tope alcanzado: se deja de grabar (la medición ligera sigue).
        parar();
        return;
      }
      await tx('readwrite', (s) => s.add({ ...datos, bytes: blob.size, blob } satisfies FragmentoLocal));
    } catch {
      /* sin espacio o sin IndexedDB: se pierde este pedazo, no la app */
    }
  });
  return cortando.then(() => { subirPendientes(); });
}

// ——— Subida ———

let subiendo = false;
export async function subirPendientes(): Promise<void> {
  if (subiendo || !navigator.onLine || ahorroDeDatos() || !soportado()) return;
  const uid = auth.currentUser?.uid;
  if (!uid) return;
  subiendo = true;
  try {
    for (const { key, f } of await listarCola()) {
      try {
        if (!f.path) {
          const path = `grabaciones/${uid}/${f.sesionId}/${String(f.seq).padStart(5, '0')}-${nuevoId().slice(0, 8)}.gz`;
          await uploadBytes(ref(storage, path), f.blob, { contentType: 'application/gzip' });
          f.path = path;
          await tx('readwrite', (s) => s.put(f, key));
        }
        const { blob: _blob, ...meta } = f;
        await api.registrarFragmento(meta);
      } catch (err) {
        const code = (err as { code?: string }).code;
        // Rechazos que nunca van a pasar (reglas de Storage, datos que el
        // servidor no acepta, otra cuenta): se tira el fragmento.
        const definitivo = code === 'storage/unauthorized' || code === 'storage/invalid-argument'
          || (err instanceof ApiError && err.status !== 401 && err.status < 500);
        if (!definitivo) return;
      }
      await tx('readwrite', (s) => s.delete(key));
    }
  } catch {
    /* IndexedDB no disponible: nada que subir */
  } finally {
    subiendo = false;
  }
}

// ——— Grabar ———

function alEvento(e: Evento) {
  if (!activo) return;
  const marcar = (tag: string, payload: unknown) => { try { record?.addCustomEvent(tag, payload); } catch { /* nada */ } };
  if (e.k === 'pantalla') { stats.pantallas.add(e.p); marcar('Pantalla', { nombre: e.p }); }
  if (e.k === 'toque') {
    stats.toques++;
    if (e.m) stats.muertos++;
    if (e.r) { stats.rabia++; marcar('Frustración', { en: e.o, pantalla: e.p }); }
  }
  if (e.k === 'error') { stats.errores++; marcar('Error', { mensaje: e.n }); }
  if (e.k === 'accion' && e.n === 'visita_guardada') marcar('Visita guardada', e.d ?? {});
  if (e.k === 'accion' && e.n === 'visita_bloqueada') marcar('No pudo guardar', e.d ?? {});
  if (e.k === 'red') marcar(e.n === 'sin_senal' ? 'Sin señal' : 'Con señal', {});
}

function grabarSesion() {
  if (!record) return;
  sesionGrabada = sesionActual();
  seq = 0;
  bytesSesion = 0;
  eventos = [];
  reiniciarStats();
  stats.pantallas.add(pantallaActual());
  detenerRecord = record({
    emit(e) {
      eventos.push(e as RrEvento);
      if (eventos.length >= MAX_EVENTOS_FRAGMENTO) cortarFragmento();
    },
    maskAllInputs: true,
    maskTextSelector: '.rr-mask',
    blockSelector: 'img, video, canvas, iframe, .rr-block',
    slimDOMOptions: 'all',
    inlineStylesheet: true,
    recordCanvas: false,
    collectFonts: false,
    inlineImages: false,
    sampling: { mousemove: false, mouseInteraction: true, scroll: 200, media: 800, input: 'last' },
    // Una "foto" completa de la pantalla cada 5 min: si se pierde un
    // pedazo, el resto se sigue pudiendo reproducir.
    checkoutEveryNms: 5 * 60 * 1000,
  });
}

function parar() {
  activo = false;
  detenerRecord?.();
  detenerRecord = undefined;
}

function alCambiarVisibilidad() {
  if (document.visibilityState === 'hidden' && activo) cortarFragmento();
}

// Decide si esta sesión se graba y, si sí, empieza. Devuelve la limpieza.
export function iniciarGrabacion(vendedor: Vendedor): () => void {
  if (!soportado()) return () => {};
  let cancelado = false;
  vendedorId = vendedor.id;
  const timers: ReturnType<typeof setInterval>[] = [];
  const quitar: (() => void)[] = [];

  // Lo que quedó sin subir de otras veces, aunque esta sesión no se grabe.
  timers.push(setInterval(() => { subirPendientes(); }, 60 * 1000));
  const alVolverSenal = () => { subirPendientes(); };
  window.addEventListener('online', alVolverSenal);
  quitar.push(() => window.removeEventListener('online', alVolverSenal));
  setTimeout(() => { if (!cancelado) subirPendientes(); }, 8000);

  (async () => {
    const config = (await cargarConfig()) ?? enCache();
    const m = quiereGrabar(vendedor, config.grabacionPorcentaje);
    if (!m || cancelado) return;
    const mod = await import('@rrweb/record').catch(() => null);
    if (!mod || cancelado) return;
    record = mod.record;
    motivo = m;
    activo = true;
    grabarSesion();
    quitar.push(onEvento(alEvento));
    // Al volver después de un rato largo es otra sesión: se cierra la
    // anterior y empieza otra grabación (con su propia "foto" inicial).
    quitar.push(onNuevaSesion(() => {
      if (!activo) return;
      cortarFragmento();
      detenerRecord?.();
      grabarSesion();
    }));
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    quitar.push(() => document.removeEventListener('visibilitychange', alCambiarVisibilidad));
    timers.push(setInterval(() => { if (activo) cortarFragmento(); }, CORTAR_CADA_MS));
  })();

  return () => {
    cancelado = true;
    if (activo) cortarFragmento();
    parar();
    timers.forEach(clearInterval);
    quitar.forEach((f) => f());
  };
}

import { useEffect, useState } from 'react';
import { api, ApiError, type Antecedente, type Progreso, type Prospecto } from './api';
import { subirFotos } from './uploadFotos';
import { fechaLocal, sumarDias } from './fechas';

// Persistencia local para trabajar sin señal (la realidad del campo): las
// visitas (con sus fotos, que son Blobs y no caben en localStorage) van a
// IndexedDB; los pings de ubicación, la ruta y el avance (ligeros, solo JSON)
// a localStorage. Todo se reenvía automáticamente al recuperar conexión — ver
// sincronizarPendientes() y el componente OfflineSync.

const DB_NAME = 'aviva-vendedor';
const DB_VERSION = 1;
const STORE_VISITAS = 'visitasPendientes';

export interface VisitaPendiente {
  campos: Record<string, string>;
  fotos: Blob[];
  nombreNegocio: string;
  capturadoEn: number;
}

function abrirDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE_VISITAS)) {
        req.result.createObjectStore(STORE_VISITAS, { autoIncrement: true });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(modo: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return abrirDb().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE_VISITAS, modo);
    const r = fn(t.objectStore(STORE_VISITAS));
    r.onsuccess = () => { resolve(r.result); db.close(); };
    r.onerror = () => { reject(r.error); db.close(); };
  }));
}

const EVENTO_PENDIENTES = 'aviva:pendientes-cambiaron';
const EVENTO_RUTA = 'aviva:ruta-cambio';
const notificarCambio = () => window.dispatchEvent(new Event(EVENTO_PENDIENTES));
const notificarRuta = () => window.dispatchEvent(new Event(EVENTO_RUTA));

export async function guardarVisitaPendiente(v: VisitaPendiente): Promise<void> {
  await tx('readwrite', (s) => s.add(v));
  notificarCambio();
}

export function contarVisitasPendientes(): Promise<number> {
  return tx('readonly', (s) => s.count()).catch(() => 0);
}

async function listarConLlave(): Promise<{ key: IDBValidKey; visita: VisitaPendiente }[]> {
  const [keys, values] = await Promise.all([
    tx('readonly', (s) => s.getAllKeys()),
    tx<VisitaPendiente[]>('readonly', (s) => s.getAll()),
  ]);
  return keys.map((key, i) => ({ key, visita: values[i] }));
}

// Lo que sigue en el teléfono esperando señal (para "Historial" y el avance
// del día), sin las fotos.
export async function listarVisitasPendientes(): Promise<Omit<VisitaPendiente, 'fotos'>[]> {
  try {
    return (await listarConLlave()).map(({ visita: { campos, nombreNegocio, capturadoEn } }) => ({ campos, nombreNegocio, capturadoEn }));
  } catch {
    return [];
  }
}

// ——— Pings de ubicación guardados sin señal ———

const PINGS_KEY = 'aviva.pingsPendientes';
const MAX_PINGS_GUARDADOS = 288; // un día completo de pings cada 5 min

export interface PingPendiente {
  vendedorId: string;
  lat: number;
  lng: number;
  accuracy: number;
  capturadoEn: number;
}

function leerJson<T>(key: string, porDefecto: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : porDefecto;
  } catch {
    return porDefecto;
  }
}

function escribirJson(key: string, valor: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(valor));
  } catch { /* almacenamiento lleno: solo se pierde el caché, no la app */ }
}

function escribirPings(pings: PingPendiente[]) {
  escribirJson(PINGS_KEY, pings.slice(-MAX_PINGS_GUARDADOS));
}

export function guardarPingPendiente(p: PingPendiente) {
  escribirPings([...leerJson<PingPendiente[]>(PINGS_KEY, []), p]);
}

// Un 4xx (menos 401) significa que el servidor nunca va a aceptar ese
// registro: se descarta para no atorar la cola. Cualquier otra falla (sin
// red, 5xx, 401 por token vencido) es temporal: se conserva y se reintenta.
function esDescartable(err: unknown): boolean {
  return err instanceof ApiError && err.status !== 401 && err.status < 500;
}

async function enviarPingsPendientes(): Promise<void> {
  let pings = leerJson<PingPendiente[]>(PINGS_KEY, []);
  while (pings.length) {
    try {
      await api.registrarUbicacion(pings[0]);
    } catch (err) {
      if (!esDescartable(err)) { escribirPings(pings); return; }
    }
    pings = pings.slice(1);
    escribirPings(pings);
  }
}

let sincronizando = false;

export async function sincronizarPendientes(): Promise<void> {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  try {
    await enviarPingsPendientes();
    for (const { key, visita } of await listarConLlave()) {
      try {
        // Si falla justo después de subir las fotos pero antes de guardar la
        // visita, el próximo reintento las vuelve a subir (quedan huérfanas
        // en Storage) — aceptable frente a perder la visita del vendedor.
        const fotos = await subirFotos(visita.campos.vendedorId, visita.fotos);
        await api.registrarVisita({ ...visita.campos, capturadoEn: visita.capturadoEn, fotos });
      } catch (err) {
        if (!esDescartable(err)) return;
      }
      await tx('readwrite', (s) => s.delete(key));
      notificarCambio();
    }
  } finally {
    sincronizando = false;
  }
}

// ——— Ruta y avance con copia local ———

// Sin señal se muestra la última ruta conocida en vez de un "no tienes
// negocios" falso, y el vendedor puede seguir registrando visitas (que se
// van a la cola offline).
const llaveRuta = (vendedorId: string) => `aviva.prospectos.${vendedorId}`;
const llaveProgreso = (vendedorId: string) => `aviva.progreso.${vendedorId}`;


// Una visita guardada con éxito o en la cola tarda en verse en el servidor
// (o ni siquiera ha llegado): esta marca local evita que el negocio siga
// apareciendo como pendiente en la lista mientras tanto.
const llaveMarcas = (vendedorId: string) => `aviva.marcas.${vendedorId}`;
interface MarcaLocal { estado: Prospecto['estado']; fechaPlan?: string | null; reagendado?: boolean; en: number }
const MARCA_VIGENCIA_MS = 3 * 24 * 60 * 60 * 1000;

function aplicarMarcas(vendedorId: string, lista: Prospecto[]): Prospecto[] {
  const marcas = leerJson<Record<string, MarcaLocal>>(llaveMarcas(vendedorId), {});
  return lista.map((p) => {
    const m = marcas[p.id];
    if (!m) return p;
    // El servidor ya refleja la visita (o algo más nuevo): la marca sobra.
    if (p.estado === m.estado && (p.fechaPlan ?? null) === (m.fechaPlan ?? p.fechaPlan ?? null)) return p;
    return {
      ...p, estado: m.estado, fechaPlan: m.fechaPlan ?? p.fechaPlan, reagendado: m.reagendado ?? p.reagendado,
      visitadoEn: m.estado === 'visitado' ? new Date(m.en).toISOString() : p.visitadoEn,
    };
  });
}

export function marcarVisitaLocal(vendedorId: string, prospectoId: string, cambio: Omit<MarcaLocal, 'en'>) {
  const ahora = Date.now();
  const marcas = leerJson<Record<string, MarcaLocal>>(llaveMarcas(vendedorId), {});
  for (const [id, m] of Object.entries(marcas)) if (ahora - m.en > MARCA_VIGENCIA_MS) delete marcas[id];
  marcas[prospectoId] = { ...cambio, en: ahora };
  escribirJson(llaveMarcas(vendedorId), marcas);
  notificarRuta();
}

// La última ruta conocida, con las visitas locales ya aplicadas.
export function rutaEnCache(vendedorId: string): Prospecto[] | null {
  const lista = leerJson<Prospecto[] | null>(llaveRuta(vendedorId), null);
  return lista && aplicarMarcas(vendedorId, lista);
}

export async function prospectosConCache(vendedorId: string): Promise<Prospecto[]> {
  try {
    const lista = await api.prospectos(vendedorId);
    escribirJson(llaveRuta(vendedorId), lista);
    precargarAntecedentes(vendedorId, lista);
    return aplicarMarcas(vendedorId, lista);
  } catch (err) {
    const cacheado = rutaEnCache(vendedorId);
    if (cacheado) return cacheado;
    throw err;
  }
}

// ——— "Visitado antes" con copia local ———

// Las visitas anteriores a cada negocio de lo que toca hoy y mañana (y lo
// atrasado) se bajan con la ruta, para tenerlas a la mano sin señal.
const llaveAntecedentes = (vendedorId: string) => `aviva.antecedentes.${vendedorId}`;
interface CacheAntecedentes { en: number; datos: Record<string, Antecedente[]> }
const ANTECEDENTES_VIGENCIA_MS = 15 * 60 * 1000;
const MAX_ANTECEDENTES = 60;

function precargarAntecedentes(vendedorId: string, lista: Prospecto[]) {
  const manana = sumarDias(fechaLocal(), 1);
  const ids = lista
    .filter((p) => p.estado === 'por_visitar' && (!p.fechaPlan || p.fechaPlan <= manana))
    .map((p) => p.id)
    .slice(0, MAX_ANTECEDENTES);
  if (!ids.length) return;
  const cache = leerJson<CacheAntecedentes>(llaveAntecedentes(vendedorId), { en: 0, datos: {} });
  if (Date.now() - cache.en < ANTECEDENTES_VIGENCIA_MS && ids.every((id) => id in cache.datos)) return;
  api.antecedentes(vendedorId, ids)
    .then((datos) => escribirJson(llaveAntecedentes(vendedorId), { en: Date.now(), datos }))
    .catch(() => { /* sin señal: se queda la copia anterior */ });
}

export function antecedentesEnCache(vendedorId: string, prospectoId: string): Antecedente[] | null {
  return leerJson<CacheAntecedentes>(llaveAntecedentes(vendedorId), { en: 0, datos: {} }).datos[prospectoId] ?? null;
}

// Para un negocio que no estaba en la copia (p. ej. uno de la próxima
// semana): se pide al servidor y se agrega a la copia.
export async function cargarAntecedentes(vendedorId: string, prospectoId: string): Promise<Antecedente[] | null> {
  try {
    const datos = await api.antecedentes(vendedorId, [prospectoId]);
    const cache = leerJson<CacheAntecedentes>(llaveAntecedentes(vendedorId), { en: 0, datos: {} });
    escribirJson(llaveAntecedentes(vendedorId), { en: cache.en, datos: { ...cache.datos, ...datos } });
    return datos[prospectoId] ?? [];
  } catch {
    return antecedentesEnCache(vendedorId, prospectoId);
  }
}

export function progresoEnCache(vendedorId: string): Progreso | null {
  return leerJson<Progreso | null>(llaveProgreso(vendedorId), null);
}

export async function progresoConCache(vendedorId: string): Promise<Progreso | null> {
  try {
    const p = await api.progreso(vendedorId);
    escribirJson(llaveProgreso(vendedorId), p);
    return p;
  } catch {
    return progresoEnCache(vendedorId);
  }
}

// Cuántas visitas siguen guardadas en el teléfono esperando señal; se
// actualiza solo (evento local) cuando se encola o se logra enviar una.
export function useVisitasPendientes(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    let activo = true;
    const refrescar = () => { contarVisitasPendientes().then((c) => { if (activo) setN(c); }); };
    refrescar();
    window.addEventListener(EVENTO_PENDIENTES, refrescar);
    return () => {
      activo = false;
      window.removeEventListener(EVENTO_PENDIENTES, refrescar);
    };
  }, []);
  return n;
}

// Se dispara cuando cambia algo de la ruta en el teléfono (una visita
// registrada, una cola que se vació) para que las pantallas se recarguen.
export function useCambiosDeRuta(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const sumar = () => setN((x) => x + 1);
    window.addEventListener(EVENTO_RUTA, sumar);
    window.addEventListener(EVENTO_PENDIENTES, sumar);
    return () => {
      window.removeEventListener(EVENTO_RUTA, sumar);
      window.removeEventListener(EVENTO_PENDIENTES, sumar);
    };
  }, []);
  return n;
}

// Estado de la conexión del navegador (aproximado: 'online' no garantiza que
// el servidor responda, pero 'offline' sí garantiza que no).
export function useEnLinea(): boolean {
  const [enLinea, setEnLinea] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setEnLinea(true);
    const off = () => setEnLinea(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return enLinea;
}

// No renderiza nada: dispara la sincronización al abrir la app, cuando el
// navegador recupera conexión, y como respaldo cada minuto (el evento
// 'online' no es confiable en todos los WebViews/navegadores móviles).
export function OfflineSync(): null {
  useEffect(() => {
    sincronizarPendientes();
    const onOnline = () => { sincronizarPendientes(); };
    window.addEventListener('online', onOnline);
    const timer = setInterval(() => { sincronizarPendientes(); }, 60 * 1000);
    return () => {
      window.removeEventListener('online', onOnline);
      clearInterval(timer);
    };
  }, []);
  return null;
}

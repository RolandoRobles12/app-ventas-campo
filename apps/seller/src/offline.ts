import { useEffect, useState } from 'react';
import { api, ApiError, type Prospecto } from './api';
import { subirFotos } from './uploadFotos';

// Persistencia local para trabajar sin señal (la realidad del campo): las
// visitas (con sus fotos, que son Blobs y no caben en localStorage) van a
// IndexedDB; los pings de ubicación (ligeros, solo JSON) a localStorage.
// Todo se reenvía automáticamente al recuperar conexión — ver
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
const notificarCambio = () => window.dispatchEvent(new Event(EVENTO_PENDIENTES));

export async function guardarVisitaPendiente(v: VisitaPendiente): Promise<void> {
  await tx('readwrite', (s) => s.add(v));
  notificarCambio();
}

export function contarVisitasPendientes(): Promise<number> {
  return tx('readonly', (s) => s.count()).catch(() => 0);
}

async function listarVisitasPendientes(): Promise<{ key: IDBValidKey; visita: VisitaPendiente }[]> {
  const [keys, values] = await Promise.all([
    tx('readonly', (s) => s.getAllKeys()),
    tx<VisitaPendiente[]>('readonly', (s) => s.getAll()),
  ]);
  return keys.map((key, i) => ({ key, visita: values[i] }));
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

function leerPings(): PingPendiente[] {
  try {
    return JSON.parse(localStorage.getItem(PINGS_KEY) || '[]');
  } catch {
    return [];
  }
}

function escribirPings(pings: PingPendiente[]) {
  try {
    localStorage.setItem(PINGS_KEY, JSON.stringify(pings.slice(-MAX_PINGS_GUARDADOS)));
  } catch { /* almacenamiento lleno: se pierde el punto, no la app */ }
}

export function guardarPingPendiente(p: PingPendiente) {
  escribirPings([...leerPings(), p]);
}

// Un 4xx (menos 401) significa que el servidor nunca va a aceptar ese
// registro: se descarta para no atorar la cola. Cualquier otra falla (sin
// red, 5xx, 401 por token vencido) es temporal: se conserva y se reintenta.
function esDescartable(err: unknown): boolean {
  return err instanceof ApiError && err.status !== 401 && err.status < 500;
}

async function enviarPingsPendientes(): Promise<void> {
  let pings = leerPings();
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
    for (const { key, visita } of await listarVisitasPendientes()) {
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

// La lista de leads, con copia local: sin señal se muestra la última lista
// conocida en vez de un "no tienes leads" falso, y el vendedor puede seguir
// abriendo sus leads y registrando visitas (que se van a la cola offline).
// Una ruta planeada por el admin (semanal/quincenal/mensual) puede traer
// prospectos de varias semanas a la vez; el vendedor solo debe ver los que
// ya le tocan — los de una semana futura se ocultan hasta que empiece esa
// ventana, para no tirarle de golpe todo el plan del mes. Los ya visitados
// siempre se muestran (son historial, no pendientes).
function disponibleHoy(p: Prospecto): boolean {
  if (p.estado !== 'por_visitar' || !p.semanaInicio) return true;
  const hoy = new Date().toISOString().slice(0, 10);
  return p.semanaInicio <= hoy;
}

export async function prospectosConCache(vendedorId: string): Promise<Prospecto[]> {
  const key = `aviva.prospectos.${vendedorId}`;
  try {
    const list = await api.prospectos(vendedorId);
    try { localStorage.setItem(key, JSON.stringify(list)); } catch { /* sin espacio: solo se pierde el caché */ }
    return list.filter(disponibleHoy);
  } catch (err) {
    const cacheado = localStorage.getItem(key);
    if (cacheado) {
      try { return (JSON.parse(cacheado) as Prospecto[]).filter(disponibleHoy); } catch { /* caché corrupto: cae al throw */ }
    }
    throw err;
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

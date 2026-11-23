import { db, Timestamp } from './db.js';

// Ajustes de la operación que el admin cambia desde el panel (Equipo →
// Registro de visitas, y Uso de la app → Grabaciones). Un solo documento:
// config/app.

export interface ConfigApp {
  // Distancia máxima (m) entre el GPS de la tablet y el negocio para poder
  // registrar la visita (el "cerco"). Es también la que cuenta una visita
  // como "hecha en el negocio" en el Tablero.
  radioCercoMetros: number;
  // De cada 100 sesiones de la app del vendedor, cuántas se graban (además
  // de las de los vendedores que el admin pidió grabar a propósito). 0 =
  // solo esos. Los eventos de uso (pantallas, toques, errores) se miden
  // siempre: son ligeros.
  grabacionPorcentaje: number;
}

export const RADIO_CERCO_MIN = 30;
export const RADIO_CERCO_MAX = 1000;
export const CONFIG_POR_DEFECTO: ConfigApp = { radioCercoMetros: 150, grabacionPorcentaje: 10 };

const ref = () => db.collection('config').doc('app');

// Se lee en cada visita: un minuto de memoria evita un read por visita.
let memo: { en: number; valor: ConfigApp } | null = null;
const MEMO_MS = 60_000;

export function normalizarRadio(v: unknown): number | null {
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= RADIO_CERCO_MIN && n <= RADIO_CERCO_MAX ? n : null;
}

export function normalizarPorcentaje(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : null;
}

export async function leerConfigApp(): Promise<ConfigApp> {
  if (memo && Date.now() - memo.en < MEMO_MS) return memo.valor;
  const d = (await ref().get()).data() ?? {};
  const valor: ConfigApp = {
    radioCercoMetros: normalizarRadio(d.radioCercoMetros) ?? CONFIG_POR_DEFECTO.radioCercoMetros,
    grabacionPorcentaje: normalizarPorcentaje(d.grabacionPorcentaje) ?? CONFIG_POR_DEFECTO.grabacionPorcentaje,
  };
  memo = { en: Date.now(), valor };
  return valor;
}

export async function guardarConfigApp(cambio: Partial<ConfigApp>, actor: string): Promise<ConfigApp> {
  const actual = await leerConfigApp();
  const valor: ConfigApp = { ...actual, ...cambio };
  await ref().set({ ...valor, actualizadoPor: actor, actualizadoEn: Timestamp.now() }, { merge: true });
  memo = { en: Date.now(), valor };
  return valor;
}

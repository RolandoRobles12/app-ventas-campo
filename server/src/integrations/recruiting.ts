/**
 * Base de colaboradores de Aviva Comercial Hub (repo aviva-recruiting,
 * proyecto de Firebase "aviva-recruiting"). Reemplaza al directorio de
 * aviva-hr: de aquí salen las altas y bajas de los vendedores de campo.
 *
 * Cómo la guarda aviva-recruiting (functions/src/integrations/syncColaboradores.ts
 * y colaboradoresSheet.ts de ese repo):
 *   - Colección `colaboradores`, un documento por persona, id = correo
 *     corporativo en minúsculas. Es una copia de la hoja "Colaboradores" que
 *     su función programada actualiza a las 12:00 y 19:00 (hora de México).
 *   - Nunca borra a nadie: una persona que deja de aparecer en la hoja queda
 *     con `presente: false` (tras 3 días sin verla), y una baja procesada
 *     deja `estatusApp: 'Baja'` (o 'Baja programada' con `fechaBajaIso`
 *     futura mientras llega el día).
 *   - El producto NO se guarda: se calcula del puesto con productoDePuesto()
 *     (src/utils/productoDePuesto.ts de ese repo), con el formato de la
 *     tienda del directorio como respaldo. La copia de abajo debe seguir sus
 *     mismas reglas — si allá cambian, hay que actualizarla aquí también.
 *
 * Sus reglas de Firestore no dejan leer `colaboradores` a nadie de fuera, así
 * que se lee con el Admin SDK y una credencial autorizada en ese proyecto:
 *   - RECRUITING_PROJECT_ID: id del proyecto (aviva-recruiting). Sin él la
 *     integración se reporta "no configurada".
 *   - RECRUITING_SERVICE_ACCOUNT (opcional): JSON de una cuenta de servicio de
 *     aviva-recruiting con rol "Cloud Datastore Viewer", tal cual o en base64.
 *     Si no se define, se usan las credenciales por defecto del entorno (la
 *     cuenta de servicio de Cloud Functions de este proyecto), que entonces
 *     necesita ese mismo rol en el proyecto aviva-recruiting. Ver README.
 */

import { applicationDefault, cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';

const APP_NAME = 'aviva-recruiting';

export function isRecruitingConfigured(): boolean {
  return !!process.env.RECRUITING_PROJECT_ID;
}

function credencial() {
  const raw = process.env.RECRUITING_SERVICE_ACCOUNT?.trim();
  if (!raw) return applicationDefault();
  const json = raw.startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf-8');
  return cert(JSON.parse(json));
}

function recruitingDb(): Firestore {
  const app = getApps().find((a) => a.name === APP_NAME)
    ?? initializeApp({ projectId: process.env.RECRUITING_PROJECT_ID, credential: credencial() }, APP_NAME);
  return getFirestore(app);
}

// ─── Productos (copia de productoDePuesto de aviva-recruiting) ─────────────

export const PRODUCTOS_RECRUITING = ['Bodega Aurrera', "Walmart y Sam's", 'Construrama', 'Casa Marchand', 'Kiosco Aviva', 'Aviva tu Negocio'] as const;
export type ProductoRecruiting = (typeof PRODUCTOS_RECRUITING)[number] | 'Otros';

const fold = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

// El orden importa: «Promotor/a Aviva tu Compra CM» es Casa Marchand y «… (WM)» es Walmart, antes que Bodega Aurrera.
const POR_PUESTO: Array<[RegExp, ProductoRecruiting]> = [
  [/kiosk manager/, 'Kiosco Aviva'],
  [/marchand|\bcm\b/, 'Casa Marchand'],
  [/tu casa|construrama|^cr\b/, 'Construrama'],
  [/walmart|\bwm\b|^sam/, "Walmart y Sam's"],
  [/^(ba|sba|mba)\b|aurrera/, 'Bodega Aurrera'],
  [/negocio/, 'Aviva tu Negocio'],
];

const POR_FORMATO: Record<string, ProductoRecruiting> = {
  BA: 'Bodega Aurrera', SBA: 'Bodega Aurrera', MBA: 'Bodega Aurrera',
  WM: "Walmart y Sam's", WALMART: "Walmart y Sam's", SAM: "Walmart y Sam's", SAMS: "Walmart y Sam's",
  CR: 'Construrama', CONSTRURAMA: 'Construrama',
  CM: 'Casa Marchand', 'CASA MARCHAND': 'Casa Marchand',
};

const clave = (raw: string) => (raw ?? '').trim().toUpperCase().replace(/['´’]/g, '');

export function productoDePuesto(puesto: string, formato = ''): ProductoRecruiting {
  const text = fold(puesto ?? '');
  return POR_PUESTO.find(([re]) => re.test(text))?.[1] ?? POR_FORMATO[clave(formato)] ?? 'Otros';
}

// ─── Colaboradores ─────────────────────────────────────────────────────────

export interface Colaborador {
  email: string;
  nombre: string;
  puesto: string;
  producto: ProductoRecruiting;
  zona: string;
  tienda: string;
  // Estado de la República (el campo `estado` de la hoja).
  entidad: string;
  hubManagerNombre: string;
  headNombre: string;
  fechaIngresoIso: string;
  fechaBajaIso: string;
  estatusApp: string;
  presente: boolean;
}

const texto = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

// Solo los campos que se usan: los documentos traen además ids de Viterbit,
// hiring manager, etc. que esta app no necesita.
const CAMPOS = [
  'nombre', 'puesto', 'zona', 'tienda', 'kioscoNombre', 'kioscoFormato', 'estado',
  'hubManagerNombre', 'hubManager', 'headNombre', 'head', 'fechaIngresoIso', 'fechaBajaIso', 'estatusApp', 'presente',
];

export async function fetchColaboradores(): Promise<Colaborador[]> {
  if (!isRecruitingConfigured()) throw new Error('RECRUITING_NOT_CONFIGURED');
  const snap = await recruitingDb().collection('colaboradores').select(...CAMPOS).get();
  return snap.docs
    .filter((d) => d.id.includes('@'))
    .map((d) => {
      const v = d.data();
      return {
        email: d.id.toLowerCase(),
        nombre: texto(v.nombre),
        puesto: texto(v.puesto),
        producto: productoDePuesto(texto(v.puesto), texto(v.kioscoFormato)),
        zona: texto(v.zona),
        tienda: texto(v.kioscoNombre) || texto(v.tienda),
        entidad: texto(v.estado),
        hubManagerNombre: texto(v.hubManagerNombre) || texto(v.hubManager),
        headNombre: texto(v.headNombre) || texto(v.head),
        fechaIngresoIso: texto(v.fechaIngresoIso),
        fechaBajaIso: texto(v.fechaBajaIso),
        estatusApp: texto(v.estatusApp),
        presente: v.presente !== false,
      };
    });
}

// Sigue trabajando hoy: aparece en la hoja, sin baja procesada y sin una
// fecha de baja que ya llegó. Una "Baja programada" sigue activa hasta su día.
export function motivoInactivo(c: Colaborador, hoyIso: string): string | null {
  if (!c.presente) return 'Ya no aparece en la base de colaboradores';
  if (c.estatusApp.toLowerCase() === 'baja') return 'Baja en la base de colaboradores';
  if (c.fechaBajaIso && c.fechaBajaIso <= hoyIso) return `Baja desde ${c.fechaBajaIso}`;
  return null;
}

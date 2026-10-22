// Sincronización del equipo de campo con la base de colaboradores de
// aviva-recruiting (ver integrations/recruiting.ts): cada colaborador cuyo
// producto está marcado "de campo" es un vendedor aquí. Lo usan el botón
// "Sincronizar ahora" del admin (routes/equipo.ts) y la función programada
// de functions/src/index.ts.
//
// Reglas, pensadas para que un dato raro no deje a nadie sin trabajar:
//   - Alta: colaborador activo de un producto de campo sin vendedor → se crea.
//   - Baja: el vendedor existe pero su colaborador ya no está activo (o se
//     cambió a un puesto que no es de campo) → estado 'Baja': ya no entra a
//     la app ni aparece en el admin. No se borra nada (sus visitas siguen
//     contando en el historial) y sus pendientes dejan de bloquear esos
//     negocios para el planeador (ver exclusiones en routes/rutas.ts).
//   - Reingreso: un vendedor dado de baja que vuelve a estar activo se reactiva.
//   - Un vendedor sin colaborador en la base (alta manual o de prueba) no se toca.
//   - Si una corrida daría de baja a demasiada gente de golpe, se detiene sin
//     escribir nada (como el freno de aviva-recruiting ante una hoja recortada);
//     el admin puede forzarla si de verdad es así.

import { db, Timestamp } from './db.js';
import { slugify } from './firestore-helpers.js';
import { hoyMx } from './fechas.js';
import { GIROS_DENUE } from './integrations/denue.js';
import {
  fetchColaboradores, motivoInactivo, PRODUCTOS_RECRUITING, type Colaborador, type ProductoRecruiting,
} from './integrations/recruiting.js';

// Los tres productos que ya existían aquí conservan su id de documento, para
// no romper el `productoId` de los vendedores que ya los tienen.
const ID_LOCAL: Partial<Record<ProductoRecruiting, string>> = {
  'Aviva tu Negocio': 'aviva-tu-negocio',
  Construrama: 'aviva-construrama',
  'Casa Marchand': 'aviva-casa-marchand',
};

export const productoIdLocal = (p: ProductoRecruiting) => ID_LOCAL[p] ?? slugify(p);

const GIROS_POR_DEFECTO: Partial<Record<ProductoRecruiting, string[]>> = {
  'Aviva tu Negocio': GIROS_DENUE,
  'Casa Marchand': ['Papelerías'],
  Construrama: ['Ferretería y tlapalería'],
};

// Mismo criterio que el mapeo que ya se usaba con aviva-hr.
const CAMPO_POR_DEFECTO: ProductoRecruiting[] = ['Aviva tu Negocio', 'Construrama', 'Casa Marchand'];

const CONFIG_REF = () => db.collection('config').doc('equipo');
const REPORTE_REF = () => db.collection('config').doc('equipoSync');

export interface ConfigEquipo {
  productosCampo: ProductoRecruiting[];
}

export async function leerConfigEquipo(): Promise<ConfigEquipo> {
  const snap = await CONFIG_REF().get();
  const guardados = (snap.data()?.productosCampo as string[] | undefined) ?? CAMPO_POR_DEFECTO;
  return { productosCampo: guardados.filter((p): p is ProductoRecruiting => (PRODUCTOS_RECRUITING as readonly string[]).includes(p)) };
}

export async function guardarConfigEquipo(config: ConfigEquipo): Promise<void> {
  await CONFIG_REF().set({ productosCampo: config.productosCampo, actualizadoEn: Timestamp.now() }, { merge: true });
  await asegurarProductos(config);
}

// Crea/actualiza el catálogo local `productos` a partir de los productos de
// aviva-recruiting. Los giros de un producto que ya existe no se tocan (los
// edita el admin en "Equipo").
async function asegurarProductos(config: ConfigEquipo): Promise<void> {
  await Promise.all(PRODUCTOS_RECRUITING.map(async (p) => {
    const ref = db.collection('productos').doc(productoIdLocal(p));
    const snap = await ref.get();
    const actual = snap.data() as { nombre?: string; esDeCampo?: boolean; giros?: string[] } | undefined;
    const esDeCampo = config.productosCampo.includes(p);
    if (actual && actual.nombre === p && actual.esDeCampo === esDeCampo && Array.isArray(actual.giros)) return;
    await ref.set({
      nombre: p, esDeCampo, origen: 'recruiting',
      ...(Array.isArray(actual?.giros) ? {} : { giros: GIROS_POR_DEFECTO[p] ?? [] }),
    }, { merge: true });
  }));
}

const PALETA = ['#ef8b3e', '#0e8a8a', '#22a36c', '#c96a1e', '#2a6fdb', '#7a52c9', '#a855f7', '#c0392b'];

function colorPara(seed: string): string {
  let hash = 0;
  for (const ch of seed) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETA[hash % PALETA.length];
}

// "JUAN PÉREZ LÓPEZ" → "Juan Pérez López"; un nombre ya capitalizado se deja igual.
function nombrePropio(nombre: string): string {
  if (nombre !== nombre.toUpperCase()) return nombre;
  return nombre.toLowerCase().replace(/(^|\s|-)(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase());
}

export function inicialesDe(nombre: string): string {
  const partes = nombre.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || '') + (partes[1]?.[0] || partes[0]?.[1] || '')).toUpperCase();
}

export interface ReporteSync {
  ok: boolean;
  fecha: string;
  origen: 'manual' | 'programada';
  actor: string | null;
  totalColaboradores: number;
  enProductosCampo: number;
  altas: { nombre: string; producto: string }[];
  bajas: { nombre: string; motivo: string }[];
  reactivados: { nombre: string }[];
  actualizados: number;
  // Vendedores que no tienen colaborador en la base (alta manual o de prueba).
  sinColaborador: number;
  // Si la corrida se frenó, por qué (no se escribió nada).
  detenido: string | null;
}

interface VendedorSync {
  nombre: string;
  email?: string | null;
  estado?: string;
  productoId?: string;
  puesto?: string;
  zona?: string;
  tienda?: string;
  entidad?: string;
  hubManagerNombre?: string;
  headNombre?: string;
}

const MAX_LISTA = 100;
const ESCRITURAS_POR_LOTE = 400;

export async function leerUltimoReporte(): Promise<ReporteSync | null> {
  const snap = await REPORTE_REF().get();
  return (snap.data()?.ultimo as ReporteSync | undefined) ?? null;
}

export async function sincronizarEquipo(opts: { origen: 'manual' | 'programada'; actor?: string | null; forzar?: boolean }): Promise<ReporteSync> {
  const [colaboradores, config, vendedoresSnap] = await Promise.all([
    fetchColaboradores(),
    leerConfigEquipo(),
    db.collection('vendedores').get(),
  ]);
  const hoy = hoyMx();
  const reporte: ReporteSync = {
    ok: false, fecha: new Date().toISOString(), origen: opts.origen, actor: opts.actor ?? null,
    totalColaboradores: colaboradores.length, enProductosCampo: 0,
    altas: [], bajas: [], reactivados: [], actualizados: 0, sinColaborador: 0, detenido: null,
  };

  if (colaboradores.length === 0) {
    reporte.detenido = 'La base de colaboradores vino vacía; no se cambió nada.';
    await REPORTE_REF().set({ ultimo: reporte });
    return reporte;
  }

  await asegurarProductos(config);

  const porEmail = new Map<string, { id: string; data: VendedorSync }>();
  for (const d of vendedoresSnap.docs) {
    const data = d.data() as VendedorSync;
    if (data.email) porEmail.set(data.email.toLowerCase(), { id: d.id, data });
  }
  const colaboradorPorEmail = new Map(colaboradores.map((c) => [c.email, c]));

  const escrituras: { ref: FirebaseFirestore.DocumentReference; data: Record<string, unknown>; crear: boolean }[] = [];
  const ahora = Timestamp.now();

  const datosDe = (c: Colaborador) => ({
    nombre: nombrePropio(c.nombre) || c.email,
    productoId: productoIdLocal(c.producto),
    puesto: c.puesto,
    zona: c.zona,
    tienda: c.tienda,
    entidad: c.entidad,
    hubManagerNombre: c.hubManagerNombre,
    headNombre: c.headNombre,
  });

  for (const c of colaboradores) {
    const deCampo = config.productosCampo.includes(c.producto as ProductoRecruiting);
    const inactivo = motivoInactivo(c, hoy);
    if (deCampo) reporte.enProductosCampo++;
    const existente = porEmail.get(c.email);

    if (deCampo && !inactivo) {
      const datos = datosDe(c);
      if (!existente) {
        escrituras.push({
          ref: db.collection('vendedores').doc(), crear: true,
          data: {
            ...datos, email: c.email, estado: 'Activo',
            iniciales: inicialesDe(datos.nombre), color: colorPara(c.email),
            // `ciudad` es lo que muestran las pantallas viejas como zona.
            ciudad: c.zona || c.tienda, colonia: null,
            fechaIngresoIso: c.fechaIngresoIso || null,
            fuente: 'recruiting', createdAt: ahora,
          },
        });
        reporte.altas.push({ nombre: datos.nombre, producto: c.producto });
        continue;
      }
      const v = existente.data;
      const reactivar = v.estado === 'Baja';
      const cambio = reactivar || v.estado !== 'Activo'
        || (Object.keys(datos) as (keyof typeof datos)[]).some((k) => (v[k] ?? '') !== datos[k]);
      if (!cambio) continue;
      escrituras.push({
        ref: db.collection('vendedores').doc(existente.id), crear: false,
        data: { ...datos, estado: 'Activo', fuente: 'recruiting', ...(reactivar ? { bajaEn: null, bajaMotivo: null } : {}) },
      });
      if (reactivar) reporte.reactivados.push({ nombre: datos.nombre });
      else reporte.actualizados++;
      continue;
    }

    // Un puesto vacío en la hoja no dice nada (aviva-recruiting tampoco
    // oculta a nadie por una celda vacía): no basta para dar de baja.
    if (!inactivo && !c.puesto && c.producto === 'Otros') continue;

    if (existente && existente.data.estado !== 'Baja') {
      const motivo = inactivo ?? `Cambió a un puesto que no es de campo: ${c.puesto || 'sin puesto'}`;
      escrituras.push({
        ref: db.collection('vendedores').doc(existente.id), crear: false,
        data: { estado: 'Baja', bajaEn: ahora, bajaMotivo: motivo, puesto: c.puesto, fuente: 'recruiting' },
      });
      reporte.bajas.push({ nombre: existente.data.nombre, motivo });
    }
  }

  for (const [email, v] of porEmail) {
    if (!colaboradorPorEmail.has(email) && v.data.estado !== 'Baja') reporte.sinColaborador++;
  }

  // Freno: una base a medio editar o una lectura incompleta no debe dejar a
  // medio equipo sin poder entrar a la app.
  const activos = [...porEmail.values()].filter((v) => v.data.estado !== 'Baja').length;
  const tope = Math.max(5, Math.ceil(activos * 0.3));
  if (reporte.bajas.length > tope && !opts.forzar) {
    reporte.detenido = `La corrida daría de baja a ${reporte.bajas.length} de ${activos} vendedores activos. No se cambió nada: revisa la base de colaboradores o fuerza la sincronización si es correcto.`;
    reporte.altas = reporte.altas.slice(0, MAX_LISTA);
    reporte.bajas = reporte.bajas.slice(0, MAX_LISTA);
    await REPORTE_REF().set({ ultimo: reporte });
    return reporte;
  }

  for (let i = 0; i < escrituras.length; i += ESCRITURAS_POR_LOTE) {
    const batch = db.batch();
    for (const e of escrituras.slice(i, i + ESCRITURAS_POR_LOTE)) {
      if (e.crear) batch.set(e.ref, e.data);
      else batch.update(e.ref, e.data);
    }
    await batch.commit();
  }

  reporte.ok = true;
  reporte.altas = reporte.altas.slice(0, MAX_LISTA);
  reporte.bajas = reporte.bajas.slice(0, MAX_LISTA);
  reporte.reactivados = reporte.reactivados.slice(0, MAX_LISTA);
  await REPORTE_REF().set({ ultimo: reporte });
  return reporte;
}

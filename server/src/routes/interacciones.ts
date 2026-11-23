import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { isEmptyRestriction, parseCsvParam, parseDateRangeQuery } from '../firestore-helpers.js';
import { puedeActuarComoVendedor, requireAdmin, vendedorAjeno } from '../auth.js';
import { fechaMx } from '../fechas.js';
import { getRecientesPorVendedor, getVendedoresDocs, resolveVendedorIds } from './_filters.js';

// Cómo usan los vendedores la app (la "capa ligera" de la medición; la
// grabación de sesiones está en grabaciones.ts). La app junta sus eventos
// (pantallas, toques, tiempo, errores, señal y los pasos de registrar una
// visita o una llamada) y los manda en lotes: cada lote es un documento de
// `interacciones`. El admin ve el resumen en "Uso de la app".
export const interaccionesRouter = Router();

export const TIPOS_EVENTO = ['app', 'pantalla', 'tiempo', 'toque', 'accion', 'error', 'red'] as const;
export type TipoEvento = (typeof TIPOS_EVENTO)[number];

// Un evento, en forma compacta (son muchos).
//   t: instante (epoch ms)       k: tipo                 p: pantalla
//   o: lo que se tocó            x, y: dónde (0–1 del ancho/alto de la pantalla)
//   ms: duración (tiempo en pantalla, rato sin señal)
//   r: toque de frustración (varios seguidos en el mismo lugar)
//   m: toque "muerto" (en algo que no hace nada)
//   n: nombre (de la acción, del error, de 'app' o 'red')
//   d: datos de la acción (p. ej. el intento al que pertenece)
export interface Evento {
  t: number; k: TipoEvento; p: string;
  o?: string; x?: number; y?: number; ms?: number; r?: 1; m?: 1; n?: string;
  d?: Record<string, string | number | boolean>;
}

export interface InteraccionDoc {
  vendedorId: string;
  sesionId: string;
  createdAt: Timestamp;
  dia: string;
  eventos: Evento[];
  recibidoEn: Timestamp;
}

const MAX_EVENTOS_LOTE = 500;
// Llegan sin señal hasta días después: se aceptan hasta 7 días hacia atrás.
const MAX_ANTIGUEDAD_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_ADELANTO_MS = 5 * 60 * 1000;
// Un rato en pantalla de más de 10 minutos casi siempre es la tablet
// prendida sin usar: se cuenta solo hasta ahí.
const MAX_MS_PANTALLA = 10 * 60 * 1000;
const MAX_DOCS_RESUMEN = 4000;
export const SESION_ID = /^[A-Za-z0-9-]{8,64}$/;

const texto = (v: unknown, max: number): string | undefined =>
  (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined);
const fraccion = (v: unknown): number | undefined => {
  const n = Number(v);
  return v != null && Number.isFinite(n) ? Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000 : undefined;
};

function limpiarDatos(raw: unknown): Evento['d'] {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>).slice(0, 8)) {
    const key = k.slice(0, 24);
    if (typeof v === 'boolean') out[key] = v;
    else if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (typeof v === 'string') out[key] = v.slice(0, 80);
  }
  return Object.keys(out).length ? out : undefined;
}

// Lo que no tiene forma de evento se tira (sin rechazar el lote completo).
export function limpiarEvento(raw: unknown, ahora = Date.now()): Evento | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  const t = Number(e.t);
  if (!Number.isFinite(t) || t > ahora + MAX_ADELANTO_MS || t < ahora - MAX_ANTIGUEDAD_MS) return null;
  if (!TIPOS_EVENTO.includes(e.k as TipoEvento)) return null;
  const p = texto(e.p, 40);
  if (!p) return null;
  const ev: Evento = { t: Math.round(t), k: e.k as TipoEvento, p };
  const o = texto(e.o, 60); if (o) ev.o = o;
  const x = fraccion(e.x); if (x !== undefined) ev.x = x;
  const y = fraccion(e.y); if (y !== undefined) ev.y = y;
  const ms = Number(e.ms);
  if (e.ms != null && Number.isFinite(ms) && ms >= 0) ev.ms = Math.round(Math.min(ms, 7 * 24 * 60 * 60 * 1000));
  if (e.r) ev.r = 1;
  if (e.m) ev.m = 1;
  const n = texto(e.n, 200); if (n) ev.n = n;
  const d = limpiarDatos(e.d); if (d) ev.d = d;
  return ev;
}

// La app del vendedor manda un lote de eventos de una sesión.
interaccionesRouter.post('/', async (req, res) => {
  const { vendedorId, sesionId, eventos } = (req.body ?? {}) as Record<string, unknown>;
  if (typeof vendedorId !== 'string' || !vendedorId || typeof sesionId !== 'string' || !SESION_ID.test(sesionId) || !Array.isArray(eventos)) {
    return res.status(400).json({ error: 'datos_invalidos', message: 'vendedorId, sesionId y eventos son requeridos' });
  }
  if (eventos.length > MAX_EVENTOS_LOTE) return res.status(400).json({ error: 'lote_grande', message: `Máximo ${MAX_EVENTOS_LOTE} eventos por lote.` });
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);

  const ahora = Date.now();
  const limpios = eventos.map((e) => limpiarEvento(e, ahora)).filter((e): e is Evento => !!e).sort((a, b) => a.t - b.t);
  if (!limpios.length) return res.status(202).json({ guardados: 0 });
  const createdAt = Timestamp.fromMillis(limpios[0].t);
  const data: InteraccionDoc = {
    vendedorId, sesionId, createdAt, dia: fechaMx(createdAt.toDate()), eventos: limpios, recibidoEn: Timestamp.now(),
  };
  await db.collection('interacciones').add(data);
  res.status(201).json({ guardados: limpios.length });
});

// ——— Resumen para el admin ———

// Pasos de las tareas principales de la app. Cada intento (abrir el
// registro de una visita, abrir la hoja de una llamada) lleva un id propio
// en d.intento: el embudo cuenta cuántos intentos llegaron a cada paso.
export const EMBUDOS: { clave: string; titulo: string; pasos: { accion: string; etiqueta: string }[] }[] = [
  {
    clave: 'visita', titulo: 'Registrar una visita',
    pasos: [
      { accion: 'visita_abierta', etiqueta: 'Abrió el registro' },
      { accion: 'visita_resultado', etiqueta: 'Eligió cómo le fue' },
      { accion: 'visita_foto', etiqueta: 'Tomó la foto' },
      { accion: 'visita_guardar', etiqueta: 'Tocó "Guardar visita"' },
      { accion: 'visita_guardada', etiqueta: 'Se guardó' },
    ],
  },
  {
    clave: 'llamada', titulo: 'Anotar una llamada',
    pasos: [
      { accion: 'llamada_abierta', etiqueta: 'Abrió la hoja de la llamada' },
      { accion: 'llamada_resultado', etiqueta: 'Eligió qué pasó' },
      { accion: 'llamada_guardada', etiqueta: 'Se guardó' },
    ],
  },
];

// Por qué "Guardar visita" no guardó (d.motivo de 'visita_bloqueada').
export const MOTIVOS_BLOQUEO: Record<string, string> = {
  lejos: 'Lejos del negocio',
  impreciso: 'GPS impreciso',
  buscando: 'Todavía buscando su ubicación',
  sin_gps: 'Sin ubicación',
  zona: 'En zona restringida',
  faltantes: 'Le faltaba algo (resultado, foto…)',
  rechazada: 'El servidor la rechazó',
  error: 'Error al guardar',
};

// México centro no tiene horario de verano desde 2022: UTC−6 todo el año.
const horaMx = (t: number) => Math.floor((((t / 3_600_000) - 6) % 24 + 24) % 24);
const CELDAS_X = 24;
const CELDAS_Y = 48;

interface FilaVendedor {
  vendedorId: string; sesiones: Set<string>; ms: number; toques: number; rabia: number; muertos: number;
  errores: number; dias: Set<string>; ultima: number; visitasAbiertas: number; visitasGuardadas: number;
}

export function resumir(docs: InteraccionDoc[]) {
  const sesiones = new Set<string>();
  const vendedores = new Map<string, FilaVendedor>();
  const pantallas = new Map<string, { vistas: number; ms: number; toques: number; rabia: number; vendedores: Set<string> }>();
  const objetivos = new Map<string, { pantalla: string; objetivo: string; toques: number; rabia: number; muertos: number }>();
  const celdas = new Map<string, Map<string, { n: number; r: number }>>();
  const errores = new Map<string, { mensaje: string; veces: number; vendedores: Set<string>; pantallas: Map<string, number>; ultima: number }>();
  const intentos = new Map<string, Map<string, Set<string>>>(EMBUDOS.map((e) => [e.clave, new Map()]));
  const bloqueos = new Map<string, number>();
  const porDia = new Map<string, { ms: number; vendedores: Set<string>; sesiones: Set<string>; toques: number }>();
  const porHora = new Array(24).fill(0) as number[];
  const pasoDe = new Map<string, { embudo: string }>();
  for (const e of EMBUDOS) for (const p of e.pasos) pasoDe.set(p.accion, { embudo: e.clave });
  let totalMs = 0; let toques = 0; let rabia = 0; let muertos = 0; let nErrores = 0; let cortes = 0; let msSinSenal = 0;
  let instalada = 0; let navegador = 0;
  const dispositivos = new Map<string, number>();

  for (const doc of docs) {
    sesiones.add(doc.sesionId);
    const fv = vendedores.get(doc.vendedorId) ?? {
      vendedorId: doc.vendedorId, sesiones: new Set(), ms: 0, toques: 0, rabia: 0, muertos: 0, errores: 0, dias: new Set(), ultima: 0, visitasAbiertas: 0, visitasGuardadas: 0,
    };
    vendedores.set(doc.vendedorId, fv);
    fv.sesiones.add(doc.sesionId);
    fv.dias.add(doc.dia);
    const dia = porDia.get(doc.dia) ?? { ms: 0, vendedores: new Set(), sesiones: new Set(), toques: 0 };
    porDia.set(doc.dia, dia);
    dia.vendedores.add(doc.vendedorId);
    dia.sesiones.add(doc.sesionId);

    for (const ev of doc.eventos) {
      fv.ultima = Math.max(fv.ultima, ev.t);
      switch (ev.k) {
        case 'pantalla': {
          const p = pantallas.get(ev.p) ?? { vistas: 0, ms: 0, toques: 0, rabia: 0, vendedores: new Set() };
          p.vistas++; p.vendedores.add(doc.vendedorId);
          pantallas.set(ev.p, p);
          break;
        }
        case 'tiempo': {
          const ms = Math.min(ev.ms ?? 0, MAX_MS_PANTALLA);
          const p = pantallas.get(ev.p) ?? { vistas: 0, ms: 0, toques: 0, rabia: 0, vendedores: new Set() };
          p.ms += ms; pantallas.set(ev.p, p);
          totalMs += ms; fv.ms += ms; dia.ms += ms;
          porHora[horaMx(ev.t)] += ms;
          break;
        }
        case 'toque': {
          toques++; fv.toques++; dia.toques++;
          if (ev.r) { rabia++; fv.rabia++; }
          if (ev.m) { muertos++; fv.muertos++; }
          const p = pantallas.get(ev.p) ?? { vistas: 0, ms: 0, toques: 0, rabia: 0, vendedores: new Set() };
          p.toques++; if (ev.r) p.rabia++;
          pantallas.set(ev.p, p);
          const objetivo = ev.o ?? '(sin nombre)';
          const ko = `${ev.p}\u0000${objetivo}`;
          const o = objetivos.get(ko) ?? { pantalla: ev.p, objetivo, toques: 0, rabia: 0, muertos: 0 };
          o.toques++; if (ev.r) o.rabia++; if (ev.m) o.muertos++;
          objetivos.set(ko, o);
          if (ev.x !== undefined && ev.y !== undefined) {
            const m = celdas.get(ev.p) ?? new Map();
            celdas.set(ev.p, m);
            const cx = Math.min(CELDAS_X - 1, Math.floor(ev.x * CELDAS_X));
            const cy = Math.min(CELDAS_Y - 1, Math.floor(ev.y * CELDAS_Y));
            const c = m.get(`${cx},${cy}`) ?? { n: 0, r: 0 };
            c.n++; if (ev.r) c.r++;
            m.set(`${cx},${cy}`, c);
          }
          break;
        }
        case 'error': {
          nErrores++; fv.errores++;
          const mensaje = ev.n ?? 'Error sin mensaje';
          const er = errores.get(mensaje) ?? { mensaje, veces: 0, vendedores: new Set(), pantallas: new Map(), ultima: 0 };
          er.veces++; er.vendedores.add(doc.vendedorId); er.ultima = Math.max(er.ultima, ev.t);
          er.pantallas.set(ev.p, (er.pantallas.get(ev.p) ?? 0) + 1);
          errores.set(mensaje, er);
          break;
        }
        case 'red': {
          if (ev.n === 'sin_senal') cortes++;
          if (ev.n === 'con_senal' && ev.ms) msSinSenal += Math.min(ev.ms, 12 * 60 * 60 * 1000);
          break;
        }
        case 'app': {
          if (ev.n === 'inicio') {
            if (ev.d?.instalada) instalada++; else navegador++;
            const disp = typeof ev.d?.dispositivo === 'string' ? ev.d.dispositivo : 'Otro';
            dispositivos.set(disp, (dispositivos.get(disp) ?? 0) + 1);
          }
          break;
        }
        case 'accion': {
          if (ev.n === 'visita_abierta' && !ev.d?.practica) fv.visitasAbiertas++;
          if (ev.n === 'visita_guardada') fv.visitasGuardadas++;
          if (ev.n === 'visita_bloqueada') {
            const motivo = typeof ev.d?.motivo === 'string' ? ev.d.motivo : 'otro';
            bloqueos.set(motivo, (bloqueos.get(motivo) ?? 0) + 1);
          }
          const paso = ev.n ? pasoDe.get(ev.n) : undefined;
          const intento = ev.d?.intento;
          if (paso && typeof intento === 'string' && !ev.d?.practica) {
            const porAccion = intentos.get(paso.embudo)!;
            const s = porAccion.get(ev.n!) ?? new Set();
            s.add(`${doc.vendedorId}:${intento}`);
            porAccion.set(ev.n!, s);
          }
          break;
        }
      }
    }
  }

  // Un intento cuenta en un paso solo si también empezó en el periodo (si
  // no, los pasos de en medio podrían rebasar al primero).
  const embudos = EMBUDOS.map((e) => {
    const porAccion = intentos.get(e.clave)!;
    const inicio = porAccion.get(e.pasos[0].accion) ?? new Set<string>();
    return {
      clave: e.clave, titulo: e.titulo,
      pasos: e.pasos.map((p, i) => ({
        accion: p.accion, etiqueta: p.etiqueta,
        intentos: i === 0 ? inicio.size : [...(porAccion.get(p.accion) ?? [])].filter((x) => inicio.has(x)).length,
      })),
    };
  });

  return {
    totales: {
      sesiones: sesiones.size, vendedores: vendedores.size, minutos: Math.round(totalMs / 60000),
      toques, rabia, muertos, errores: nErrores, cortesSenal: cortes, minutosSinSenal: Math.round(msSinSenal / 60000),
      inicios: { instalada, navegador },
    },
    dispositivos: [...dispositivos.entries()].map(([nombre, sesiones]) => ({ nombre, sesiones })).sort((a, b) => b.sesiones - a.sesiones),
    pantallas: [...pantallas.entries()]
      .map(([pantalla, p]) => ({ pantalla, vistas: p.vistas, minutos: Math.round(p.ms / 6000) / 10, toques: p.toques, rabia: p.rabia, vendedores: p.vendedores.size }))
      .sort((a, b) => b.minutos - a.minutos || b.vistas - a.vistas),
    objetivos: [...objetivos.values()].sort((a, b) => b.toques - a.toques).slice(0, 150),
    mapaToques: [...celdas.entries()].map(([pantalla, m]) => ({
      pantalla,
      celdas: [...m.entries()].map(([k, c]) => {
        const [cx, cy] = k.split(',').map(Number);
        return { x: (cx + 0.5) / CELDAS_X, y: (cy + 0.5) / CELDAS_Y, n: c.n, r: c.r };
      }),
    })),
    rejilla: { x: CELDAS_X, y: CELDAS_Y },
    embudos,
    bloqueos: [...bloqueos.entries()]
      .map(([motivo, veces]) => ({ motivo, etiqueta: MOTIVOS_BLOQUEO[motivo] ?? motivo, veces }))
      .sort((a, b) => b.veces - a.veces),
    errores: [...errores.values()]
      .map((e) => ({
        mensaje: e.mensaje, veces: e.veces, vendedores: e.vendedores.size, ultima: new Date(e.ultima).toISOString(),
        pantalla: [...e.pantallas.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null,
      }))
      .sort((a, b) => b.veces - a.veces).slice(0, 50),
    porDia: [...porDia.entries()]
      .map(([dia, d]) => ({ dia, minutos: Math.round(d.ms / 60000), vendedores: d.vendedores.size, sesiones: d.sesiones.size, toques: d.toques }))
      .sort((a, b) => a.dia.localeCompare(b.dia)),
    porHora: porHora.map((ms) => Math.round(ms / 60000)),
    vendedores: [...vendedores.values()],
  };
}

// Solo admin: el resumen del periodo con los filtros de siempre.
interaccionesRouter.get('/resumen', requireAdmin, async (req, res) => {
  const { vendedorIds, productoIds, desde, hasta } = req.query as Record<string, string | undefined>;
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  const rango = parseDateRangeQuery(desde, hasta);
  const vacio = resumir([]);
  if (isEmptyRestriction(ids)) return res.json({ ...vacio, vendedores: [], truncado: false });
  const docs = await getRecientesPorVendedor('interacciones', ids, MAX_DOCS_RESUMEN, (q) => (rango
    ? q.where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end))
    : q));
  const r = resumir(docs.map((d) => d.data() as InteraccionDoc));
  const vendedoresDocs = await getVendedoresDocs(r.vendedores.map((v) => v.vendedorId));
  const info = new Map(vendedoresDocs.map((d) => [d.id, d.data() as { nombre?: string; iniciales?: string; color?: string; grabarHasta?: string | null }]));
  res.json({
    ...r,
    vendedores: r.vendedores
      .map((v) => {
        const i = info.get(v.vendedorId);
        return {
          id: v.vendedorId, nombre: i?.nombre ?? '—', iniciales: i?.iniciales ?? '?', color: i?.color ?? '#8a978f', grabarHasta: i?.grabarHasta ?? null,
          sesiones: v.sesiones.size, dias: v.dias.size, minutos: Math.round(v.ms / 60000),
          minutosPorDia: v.dias.size ? Math.round(v.ms / 60000 / v.dias.size) : 0,
          toques: v.toques, rabia: v.rabia, muertos: v.muertos, errores: v.errores,
          visitasAbiertas: v.visitasAbiertas, visitasGuardadas: v.visitasGuardadas,
          ultima: v.ultima ? new Date(v.ultima).toISOString() : null,
        };
      })
      .sort((a, b) => b.minutos - a.minutos),
    truncado: docs.length >= MAX_DOCS_RESUMEN,
  });
});

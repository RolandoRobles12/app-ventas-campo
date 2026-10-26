import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso, parseCsvParam, parseDateRangeQuery, isEmptyRestriction, parseCapturadoEn } from '../firestore-helpers.js';
import { requireAdmin, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { productosPorId } from './vendedores.js';
import { esFechaIso, fechaMx, hoyMx } from '../fechas.js';
import { getRecientesPorVendedor, resolveVendedorIds } from './_filters.js';
import { negocioIdDe } from '../negocios.js';

// Llamadas del vendedor a los negocios de su ruta que tienen teléfono. El
// vendedor es dueño de su agenda: si en la llamada agenda una visita, el
// negocio se mueve a ese día (con su hora) aunque el coordinador lo haya
// planeado para otro. Cada llamada queda guardada para que el admin vea a
// quién se llamó, qué pasó y las citas que vienen.
export const llamadasRouter = Router();

export const RESULTADOS_LLAMADA = ['cita', 'llamar_despues', 'no_contesto', 'no_interesa', 'numero_equivocado'] as const;
export type ResultadoLlamada = (typeof RESULTADOS_LLAMADA)[number];

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_NOTAS = 500;
const MAX_LLAMADAS_LISTA = 2000;
const MAX_CITAS = 500;

export interface LlamadaDoc {
  vendedorId: string;
  vendedorNombre: string;
  productoNombre: string | null;
  prospectoId: string;
  negocioId: string;
  nombreNegocio: string;
  direccion: string;
  telefono: string | null;
  resultado: ResultadoLlamada;
  citaFecha: string | null;
  citaHora: string | null;
  // Solo con "número equivocado": el número correcto, si el vendedor lo consiguió.
  telefonoNuevo: string | null;
  notas: string | null;
  createdAt: Timestamp;
}

// Solo dígitos (y un + inicial); null si no parece un teléfono.
export function normalizarTelefono(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const limpio = raw.trim().replace(/[^\d+]/g, '').replace(/(?!^)\+/g, '');
  const digitos = limpio.replace(/\D/g, '');
  return digitos.length >= 8 && digitos.length <= 15 ? limpio : null;
}

function shape(id: string, l: LlamadaDoc) {
  return {
    id,
    vendedorId: l.vendedorId,
    vendedorNombre: l.vendedorNombre,
    producto: l.productoNombre ?? '—',
    prospectoId: l.prospectoId,
    negocioId: l.negocioId,
    nombreNegocio: l.nombreNegocio,
    direccion: l.direccion,
    telefono: l.telefono,
    resultado: l.resultado,
    citaFecha: l.citaFecha,
    citaHora: l.citaHora,
    telefonoNuevo: l.telefonoNuevo,
    notas: l.notas,
    createdAt: toIso(l.createdAt),
  };
}

// Llamadas a un negocio, de cualquier vendedor (para su historial en el admin).
export async function llamadasDeNegocio(negocioId: string, limite: number) {
  const snap = await db.collection('llamadas').where('negocioId', '==', negocioId)
    .orderBy('createdAt', 'desc').limit(limite).get();
  return snap.docs.map((d) => shape(d.id, d.data() as LlamadaDoc));
}

llamadasRouter.post('/', async (req, res) => {
  const { vendedorId, prospectoId, resultado, citaFecha, citaHora, notas, telefonoNuevo, capturadoEn } = req.body as Record<string, unknown>;
  if (typeof vendedorId !== 'string' || typeof prospectoId !== 'string' || !vendedorId || !prospectoId) {
    return res.status(400).json({ error: 'datos_invalidos', message: 'vendedorId y prospectoId son requeridos' });
  }
  if (!RESULTADOS_LLAMADA.includes(resultado as ResultadoLlamada)) return res.status(400).json({ error: 'resultado_invalido', message: 'Resultado de llamada no válido.' });
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);

  const createdAt = parseCapturadoEn(capturadoEn) ?? Timestamp.now();
  const esCita = resultado === 'cita';
  if (esCita && (!esFechaIso(citaFecha) || citaFecha < fechaMx(createdAt.toDate()) || typeof citaHora !== 'string' || !HORA.test(citaHora))) {
    return res.status(400).json({ error: 'cita_invalida', message: 'Elige el día y la hora de la cita.' });
  }

  const prospectoRef = db.collection('prospectos').doc(prospectoId);
  const [prospectoDoc, vendedorDoc] = await Promise.all([prospectoRef.get(), db.collection('vendedores').doc(vendedorId).get()]);
  const p = prospectoDoc.data() as { vendedorId?: string; negocioId?: string; nombre: string; direccion: string; telefono?: string | null; lat?: number | null; lng?: number | null } | undefined;
  // Solo negocios de su propia ruta.
  if (!p || p.vendedorId !== vendedorId) return res.status(404).json({ error: 'negocio_no_encontrado', message: 'Este negocio ya no está en tu ruta.' });

  const nuevoTel = resultado === 'numero_equivocado' ? normalizarTelefono(telefonoNuevo) : null;
  const cambios: Record<string, unknown> = { ultimaLlamada: { resultado, en: createdAt } };
  if (!p.negocioId) cambios.negocioId = negocioIdDe(p);
  if (esCita) {
    Object.assign(cambios, { estado: 'por_visitar', fechaPlan: citaFecha, orden: 0, citaFecha, citaHora });
  } else if (resultado === 'no_interesa') {
    // Si ya tenía cita y por teléfono la canceló, la cita se quita (el
    // negocio sigue en su ruta el día que estaba).
    Object.assign(cambios, { citaFecha: null, citaHora: null });
  } else if (resultado === 'numero_equivocado') {
    Object.assign(cambios, nuevoTel ? { telefono: nuevoTel, telefonoInvalido: false } : { telefonoInvalido: true });
  }
  await prospectoRef.update(cambios);

  const vendedor = vendedorDoc.data() as { nombre?: string; productoId?: string } | undefined;
  const productoNombre = vendedor?.productoId ? (await productosPorId([vendedor.productoId])).get(vendedor.productoId) ?? null : null;
  const data: LlamadaDoc = {
    vendedorId,
    vendedorNombre: vendedor?.nombre ?? '',
    productoNombre,
    prospectoId,
    negocioId: p.negocioId || (cambios.negocioId as string),
    nombreNegocio: p.nombre,
    direccion: p.direccion,
    telefono: p.telefono ?? null,
    resultado: resultado as ResultadoLlamada,
    citaFecha: esCita ? (citaFecha as string) : null,
    citaHora: esCita ? (citaHora as string) : null,
    telefonoNuevo: nuevoTel,
    notas: typeof notas === 'string' && notas.trim() ? notas.trim().slice(0, MAX_NOTAS) : null,
    createdAt,
  };
  const ref = await db.collection('llamadas').add(data);
  res.status(201).json(shape(ref.id, data));
});

// Solo admin: llamadas del periodo con los filtros de siempre.
llamadasRouter.get('/', requireAdmin, async (req, res) => {
  const { vendedorIds, productoIds, resultados, desde, hasta } = req.query as Record<string, string | undefined>;
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json({ items: [], truncado: false });
  const rango = parseDateRangeQuery(desde, hasta);
  const resultadoList = parseCsvParam(resultados);
  const docs = await getRecientesPorVendedor('llamadas', ids, MAX_LLAMADAS_LISTA, (q) => (rango
    ? q.where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end))
    : q));
  let items = docs.map((d) => shape(d.id, d.data() as LlamadaDoc));
  if (resultadoList.length) items = items.filter((l) => resultadoList.includes(l.resultado));
  res.json({ items, truncado: docs.length >= MAX_LLAMADAS_LISTA });
});

// Solo admin: citas que vienen (de hoy en adelante) y siguen sin visitarse.
llamadasRouter.get('/citas', requireAdmin, async (req, res) => {
  const { vendedorIds, productoIds } = req.query as Record<string, string | undefined>;
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json([]);
  // Un solo filtro de rango (índice automático); el resto se filtra aquí: las
  // citas pendientes son pocas.
  const snap = await db.collection('prospectos').where('citaFecha', '>=', hoyMx()).orderBy('citaFecha').limit(MAX_CITAS).get();
  const permitidos = ids ? new Set(ids) : null;
  const citas = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as { vendedorId: string; negocioId?: string; nombre: string; direccion: string; telefono?: string | null; estado: string; fechaPlan?: string | null; citaFecha: string; citaHora: string | null }) }))
    .filter((c) => c.estado === 'por_visitar' && c.fechaPlan === c.citaFecha && (!permitidos || permitidos.has(c.vendedorId)));
  const vendedores = new Map((citas.length
    ? await db.getAll(...[...new Set(citas.map((c) => c.vendedorId))].map((id) => db.collection('vendedores').doc(id)))
    : []).map((v) => [v.id, (v.get('nombre') as string | undefined) ?? '—']));
  res.json(citas
    .map((c) => ({
      prospectoId: c.id, negocioId: c.negocioId || negocioIdDe(c), vendedorId: c.vendedorId, vendedorNombre: vendedores.get(c.vendedorId) ?? '—',
      nombre: c.nombre, direccion: c.direccion, telefono: c.telefono ?? null, citaFecha: c.citaFecha, citaHora: c.citaHora,
    }))
    .sort((a, b) => a.citaFecha.localeCompare(b.citaFecha) || (a.citaHora ?? '').localeCompare(b.citaHora ?? '')));
});

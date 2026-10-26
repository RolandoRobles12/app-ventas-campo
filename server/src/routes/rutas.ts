import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { chunkArray, parseCsvParam } from '../firestore-helpers.js';
import { diasEntre, esFechaIso, hoyMx, sumarDias } from '../fechas.js';
import { centroYRadioDePoligonos, consultarDenue, isDenueConfigured, type UbicacionGps } from '../integrations/denue.js';
import { geocodificar, isGoogleMapsConfigured } from '../integrations/googleMaps.js';
import {
  fechasDeTrabajo, normalizarConfig, ordenarRuta, repartirPorDias, siguienteDiaDeTrabajo, type RutaConfig,
} from '../rutas/planificador.js';
import type { VendedorDoc } from './vendedores.js';
import { negocioIdDe } from '../negocios.js';

// Planeación de rutas (solo admin). La idea es que armar la ruta de un
// vendedor sean tres decisiones —zona, giros y ritmo— y un clic:
//   - POST /:id/generar   → vista previa: consulta el DENUE, quita negocios que
//                            ya trae otro vendedor del mismo producto, ordena un
//                            recorrido corto y lo reparte por día. No escribe nada.
//   - POST /:id/publicar  → guarda la ruta (la vista previa, ya editada) y la
//                            configuración para poder renovarla después.
//   - POST /:id/renovar   → genera y publica el siguiente periodo con la
//                            configuración guardada, sin pasar por la vista previa.
//   - GET  /estado        → hasta cuándo tiene ruta cada vendedor.
export const rutasRouter = Router();

const POR_VISITAR = 'por_visitar';
// Un negocio que ya se visitó hace menos que esto no se vuelve a proponer.
const DIAS_SIN_REPETIR_VISITADO = 90;
const ESCRITURAS_POR_LOTE = 400;

interface ProspectoExclusion {
  negocioId?: string;
  nombre: string;
  direccion: string;
  estado: string;
  createdAt?: Timestamp;
  visitadoEn?: Timestamp | null;
}

export interface ItemRuta {
  negocioId?: string | null;
  denueId?: string | null;
  nombre: string;
  direccion: string;
  giro?: string | null;
  telefono?: string | null;
  lat?: number | null;
  lng?: number | null;
  distanciaKm?: number | null;
  fechaPlan: string;
  orden: number;
  manual?: boolean;
}

class ErrorRuta extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

async function leerVendedor(id: string): Promise<VendedorDoc & { id: string }> {
  const doc = await db.collection('vendedores').doc(id).get();
  if (!doc.exists) throw new ErrorRuta(404, 'NOT_FOUND', 'No existe ese vendedor.');
  return { id: doc.id, ...(doc.data() as VendedorDoc) };
}

// Negocios (negocioId) que no deben volver a proponerse: lo pendiente de
// cualquier vendedor del mismo producto (para que dos vendedores no lleguen
// al mismo negocio) y lo que se visitó en los últimos 90 días. Si la ruta
// nueva va a reemplazar los pendientes del propio vendedor, esos sí pueden
// volver a salir (si no, se perderían: ni en la ruta vieja ni en la nueva).
async function exclusiones(productoId: string, vendedorId: string, reemplazar: boolean): Promise<Set<string>> {
  // Solo vendedores activos: lo pendiente de alguien que ya no está activo
  // no debe bloquear esos negocios para el resto.
  const companeros = (await db.collection('vendedores').where('productoId', '==', productoId).select('estado').get())
    .docs.filter((d) => d.get('estado') !== 'Baja').map((d) => d.id);
  const ids = [...new Set([...companeros, vendedorId])];
  const limiteVisitado = Date.now() - DIAS_SIN_REPETIR_VISITADO * 86_400_000;
  const snaps = await Promise.all(chunkArray(ids).map((c) => db.collection('prospectos')
    .where('vendedorId', 'in', c).select('vendedorId', 'negocioId', 'nombre', 'direccion', 'estado', 'createdAt', 'visitadoEn').get()));
  const out = new Set<string>();
  for (const d of snaps.flatMap((s) => s.docs)) {
    const p = d.data() as ProspectoExclusion;
    if (reemplazar && p.estado === POR_VISITAR && d.get('vendedorId') === vendedorId) continue;
    const cuando = (p.visitadoEn ?? p.createdAt)?.toMillis() ?? 0;
    if (p.estado === POR_VISITAR || cuando >= limiteVisitado) out.add(claveProspecto(p));
  }
  return out;
}

// Prospectos guardados antes de existir negocioId (ver backfill-historial.ts)
// se identifican igual, calculándolo al vuelo.
function claveProspecto(p: { negocioId?: string; nombre: string; direccion: string; lat?: number | null; lng?: number | null }): string {
  return p.negocioId || negocioIdDe(p);
}

async function resolverUbicacion(config: RutaConfig): Promise<UbicacionGps> {
  const z = config.zona;
  if (z.poligonos?.length) return centroYRadioDePoligonos(z.poligonos);
  if (z.lat != null && z.lng != null) return { lat: z.lat, lng: z.lng, radioMetros: z.radioMetros };
  try {
    const geo = await geocodificar(z.etiqueta);
    if (!geo) throw new ErrorRuta(404, 'UBICACION_NO_ENCONTRADA', `No se encontró "${z.etiqueta}". Elige una sugerencia del buscador o haz clic en el mapa.`);
    return { lat: geo.lat, lng: geo.lng, radioMetros: z.radioMetros };
  } catch (err: any) {
    if (err instanceof ErrorRuta) throw err;
    if (err.message === 'GOOGLE_MAPS_NOT_CONFIGURED') {
      throw new ErrorRuta(501, 'GOOGLE_MAPS_NOT_CONFIGURED', 'Para buscar por texto falta GOOGLE_MAPS_API_KEY en el servidor. Haz clic en el mapa para elegir el centro de la zona.');
    }
    throw new ErrorRuta(502, 'GOOGLE_MAPS_REQUEST_FAILED', err?.message || 'Error ubicando la zona');
  }
}

async function generar(vendedor: VendedorDoc & { id: string }, config: RutaConfig, inicio: string, reemplazar: boolean) {
  if (!isDenueConfigured()) {
    throw new ErrorRuta(501, 'DENUE_NOT_CONFIGURED', 'El DENUE no está configurado en el servidor (falta DENUE_TOKEN).');
  }
  const fechas = fechasDeTrabajo(inicio, config.semanas, config.dias);
  if (!fechas.length) throw new ErrorRuta(400, 'SIN_DIAS', 'No hay días de trabajo en ese periodo.');
  const necesarios = fechas.length * config.visitasPorDia;

  const [ubicacion, excluir] = await Promise.all([
    resolverUbicacion(config),
    exclusiones(vendedor.productoId, vendedor.id, reemplazar),
  ]);

  let resultados;
  try {
    resultados = await consultarDenue({
      giros: config.giros, cantidad: necesarios, ubicacion,
      poligonos: config.zona.poligonos ?? undefined, excluir: [...excluir],
    });
  } catch (err: any) {
    throw new ErrorRuta(502, 'DENUE_REQUEST_FAILED', err?.message || 'Error consultando el DENUE');
  }

  const centro = { lat: ubicacion.lat, lng: ubicacion.lng };
  const items: ItemRuta[] = repartirPorDias(ordenarRuta(resultados, centro), fechas, config.visitasPorDia).map((r) => ({
    negocioId: r.negocioId, denueId: r.denueId, nombre: r.nombre, direccion: r.direccion, giro: r.giro, telefono: r.telefono ?? null,
    lat: r.lat ?? null, lng: r.lng ?? null, distanciaKm: r.distanciaKm ?? null,
    fechaPlan: r.fechaPlan, orden: r.orden,
  }));
  console.log(`Ruta generada para ${vendedor.id}: ${items.length}/${necesarios} negocios, ${fechas.length} días desde ${inicio}, ${excluir.size} excluidos`);
  return { items, fechas, necesarios, encontrados: resultados.length, centro, radioMetros: ubicacion.radioMetros ?? config.zona.radioMetros };
}

function itemValido(i: unknown): i is ItemRuta {
  const x = i as ItemRuta;
  return !!x && typeof x.nombre === 'string' && !!x.nombre.trim() && esFechaIso(x.fechaPlan) && Number.isFinite(Number(x.orden));
}

// Las citas que el vendedor agendó por teléfono (de hoy en adelante) se
// conservan: son compromisos con el negocio. Devuelve cuántos borró y los
// que se quedaron, para no volver a agregarlos.
async function borrarPendientes(vendedorId: string): Promise<{ eliminados: number; conservados: Set<string> }> {
  const snap = await db.collection('prospectos').where('vendedorId', '==', vendedorId).where('estado', '==', POR_VISITAR)
    .select('negocioId', 'nombre', 'direccion', 'lat', 'lng', 'fechaPlan', 'citaFecha').get();
  const hoy = hoyMx();
  const conCita = (d: FirebaseFirestore.QueryDocumentSnapshot) => {
    const citaFecha = d.get('citaFecha') as string | null | undefined;
    return !!citaFecha && citaFecha >= hoy && citaFecha === d.get('fechaPlan');
  };
  const borrar = snap.docs.filter((d) => !conCita(d));
  for (const lote of chunkArray(borrar, ESCRITURAS_POR_LOTE)) {
    const batch = db.batch();
    lote.forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  const conservados = new Set(snap.docs.filter(conCita).map((d) => claveProspecto(d.data() as ProspectoExclusion)));
  return { eliminados: borrar.length, conservados };
}

async function publicar(vendedorId: string, config: RutaConfig, items: ItemRuta[], reemplazar: boolean, centro?: { lat: number; lng: number }) {
  // Si la zona se eligió por texto o por polígono, se guarda también el
  // centro ya resuelto: la próxima renovación no vuelve a geocodificar.
  const configGuardada: RutaConfig = centro && config.zona.lat == null
    ? { ...config, zona: { ...config.zona, lat: centro.lat, lng: centro.lng } }
    : config;
  await db.collection('vendedores').doc(vendedorId).update({ rutaConfig: configGuardada, giros: config.giros });

  const borrado = reemplazar ? await borrarPendientes(vendedorId) : null;
  const eliminados = borrado?.eliminados ?? 0;
  const existentes = borrado ? borrado.conservados : new Set(
    (await db.collection('prospectos').where('vendedorId', '==', vendedorId).select('negocioId', 'nombre', 'direccion', 'lat', 'lng').get())
      .docs.map((d) => claveProspecto(d.data() as ProspectoExclusion)),
  );
  // El negocioId siempre lo calcula el servidor: no se confía en el que
  // trae la vista previa (un negocio agregado a mano no lo tiene).
  const conId = items.map((i) => {
    const nombre = i.nombre.trim();
    const direccion = (i.direccion || '').trim();
    return { ...i, nombre, direccion, negocioId: negocioIdDe({ nombre, direccion, lat: i.lat, lng: i.lng }) };
  });
  const vistos = new Set<string>();
  const nuevos = conId.filter((i) => {
    if (existentes.has(i.negocioId) || vistos.has(i.negocioId)) return false;
    vistos.add(i.negocioId);
    return true;
  });

  const ahora = Timestamp.now();
  for (const lote of chunkArray(nuevos, ESCRITURAS_POR_LOTE)) {
    const batch = db.batch();
    for (const i of lote) {
      batch.set(db.collection('prospectos').doc(), {
        vendedorId, negocioId: i.negocioId, denueId: !i.manual && typeof i.denueId === 'string' ? i.denueId.slice(0, 32) : null,
        nombre: i.nombre, direccion: i.direccion,
        giro: i.giro ?? null, telefono: i.telefono ?? null,
        lat: i.lat ?? null, lng: i.lng ?? null, distanciaKm: i.distanciaKm ?? null,
        origen: i.manual ? 'manual' : 'denue', estado: POR_VISITAR,
        fechaPlan: i.fechaPlan, orden: Number(i.orden),
        semanaInicio: null, semanaHasta: null, createdAt: ahora,
      });
    }
    await batch.commit();
  }
  const fechas = nuevos.map((i) => i.fechaPlan).sort();
  return { creados: nuevos.length, eliminados, desde: fechas[0] ?? null, hasta: fechas[fechas.length - 1] ?? null };
}

// Última fecha planeada que el vendedor tiene pendiente (null si ninguna).
async function rutaHasta(vendedorId: string): Promise<string | null> {
  const snap = await db.collection('prospectos')
    .where('vendedorId', '==', vendedorId).where('estado', '==', POR_VISITAR)
    .orderBy('fechaPlan', 'desc').limit(1).get();
  return (snap.docs[0]?.get('fechaPlan') as string | undefined) ?? null;
}

function responderError(res: import('express').Response, err: unknown) {
  if (err instanceof ErrorRuta) return res.status(err.status).json({ error: err.code, message: err.message });
  throw err;
}

rutasRouter.get('/status', (_req, res) => {
  res.json({ denue: isDenueConfigured(), googleMaps: isGoogleMapsConfigured() });
});

// Estado de la ruta de cada vendedor: cuántos pendientes tiene, cuántos le
// tocan hoy, cuántos se le atrasaron y hasta qué día le alcanza. Son conteos
// (un read por cada mil documentos), no lecturas de cada prospecto.
rutasRouter.get('/estado', async (req, res) => {
  const { productoIds, vendedorIds } = req.query as { productoIds?: string; vendedorIds?: string };
  const fProductos = parseCsvParam(productoIds);
  const fVendedores = parseCsvParam(vendedorIds);
  const hoy = hoyMx();

  const vendedores = (await db.collection('vendedores').get()).docs
    .map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }))
    .filter((v) => (!fProductos.length || fProductos.includes(v.productoId)) && (!fVendedores.length || fVendedores.includes(v.id)));

  const pend = (id: string) => db.collection('prospectos').where('vendedorId', '==', id).where('estado', '==', POR_VISITAR);
  const out = await Promise.all(vendedores.map(async (v) => {
    const pendientes = (await pend(v.id).count().get()).data().count;
    const base = {
      vendedorId: v.id, pendientes, conFecha: 0, sinFecha: 0, atrasadas: 0, hoy: 0, hasta: null as string | null,
      tieneConfig: !!v.rutaConfig, zona: v.rutaConfig?.zona.etiqueta || null, visitasPorDia: v.rutaConfig?.visitasPorDia ?? null,
      diasRestantes: null as number | null,
    };
    if (!pendientes) return base;
    const [conFecha, atrasadas, deHoy, hasta] = await Promise.all([
      pend(v.id).where('fechaPlan', '>=', '2000-01-01').count().get(),
      pend(v.id).where('fechaPlan', '<', hoy).count().get(),
      pend(v.id).where('fechaPlan', '==', hoy).count().get(),
      rutaHasta(v.id),
    ]);
    return {
      ...base,
      conFecha: conFecha.data().count,
      sinFecha: pendientes - conFecha.data().count,
      atrasadas: atrasadas.data().count,
      hoy: deHoy.data().count,
      hasta,
      diasRestantes: hasta ? diasEntre(hoy, hasta) : null,
    };
  }));
  res.json({ hoy, items: out });
});

rutasRouter.post('/:vendedorId/generar', async (req, res) => {
  try {
    const config = normalizarConfig(req.body?.config);
    if (typeof config === 'string') return res.status(400).json({ error: 'CONFIG_INVALIDA', message: config });
    const inicio = req.body?.inicio;
    if (!esFechaIso(inicio)) return res.status(400).json({ error: 'FECHA_INVALIDA', message: 'Elige la fecha de inicio.' });
    const vendedor = await leerVendedor(req.params.vendedorId);
    res.json(await generar(vendedor, config, inicio, req.body?.reemplazarPendientes === true));
  } catch (err) {
    return responderError(res, err);
  }
});

rutasRouter.post('/:vendedorId/publicar', async (req, res) => {
  try {
    const config = normalizarConfig(req.body?.config);
    if (typeof config === 'string') return res.status(400).json({ error: 'CONFIG_INVALIDA', message: config });
    const items = Array.isArray(req.body?.items) ? (req.body.items as unknown[]).filter(itemValido) : [];
    if (!items.length) return res.status(400).json({ error: 'SIN_NEGOCIOS', message: 'La ruta no tiene negocios.' });
    const vendedor = await leerVendedor(req.params.vendedorId);
    if (vendedor.estado === 'Baja') return res.status(400).json({ error: 'VENDEDOR_BAJA', message: 'Ese vendedor está dado de baja.' });
    const centro = req.body?.centro && Number.isFinite(req.body.centro.lat) && Number.isFinite(req.body.centro.lng) ? req.body.centro : undefined;
    res.json(await publicar(vendedor.id, config, items, req.body?.reemplazarPendientes === true, centro));
  } catch (err) {
    return responderError(res, err);
  }
});

// Siguiente periodo con la misma configuración: arranca el día de trabajo
// siguiente a lo que ya tiene planeado (u hoy, si ya no le queda nada).
rutasRouter.post('/:vendedorId/renovar', async (req, res) => {
  try {
    const vendedor = await leerVendedor(req.params.vendedorId);
    if (vendedor.estado === 'Baja') return res.status(400).json({ error: 'VENDEDOR_BAJA', message: 'Ese vendedor está dado de baja.' });
    const config = vendedor.rutaConfig ? normalizarConfig(vendedor.rutaConfig) : null;
    if (!config || typeof config === 'string') {
      return res.status(400).json({ error: 'SIN_CONFIG', message: 'Este vendedor aún no tiene zona configurada: planea su primera ruta.' });
    }
    const hoy = hoyMx();
    const hasta = await rutaHasta(vendedor.id);
    const inicio = siguienteDiaDeTrabajo(hasta && hasta >= hoy ? sumarDias(hasta, 1) : hoy, config.dias);
    const generada = await generar(vendedor, config, inicio, false);
    if (!generada.items.length) {
      return res.status(404).json({ error: 'SIN_RESULTADOS', message: 'El DENUE ya no encontró negocios nuevos en su zona: amplía el radio o cambia los giros en el planeador.' });
    }
    const publicado = await publicar(vendedor.id, config, generada.items, false, generada.centro);
    res.json({ ...publicado, necesarios: generada.necesarios, encontrados: generada.encontrados });
  } catch (err) {
    return responderError(res, err);
  }
});

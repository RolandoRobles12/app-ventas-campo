import { Router } from 'express';
import { db, Timestamp, FieldPath } from '../db.js';
import { toIso, haversineMetros, chunkArray, parseDateRangeQuery, parseCsvParam, isEmptyRestriction, parseCapturadoEn } from '../firestore-helpers.js';
import { requireAdmin, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { productosPorId } from './vendedores.js';
import { esFechaIso, fechaMx, sumarDias } from '../fechas.js';
import { resolveVendedorIds } from './_filters.js';
import { esNegocioIdValido, negocioIdDe } from '../negocios.js';

export const visitasRouter = Router();

const MAX_FOTOS_POR_VISITA = 5;
const RESULTADO_REAGENDA = 'Se reagenda visita';

// Radio dentro del cual la ubicación GPS capturada en la visita se considera
// que corresponde al negocio. Solo aplica a prospectos que vienen del DENUE
// (coordenadas reales de INEGI) — un negocio agregado a mano o "nuevo" no
// tiene una ubicación de referencia contra la cual validar.
const RADIO_UBICACION_VALIDA_METROS = 50;

export interface VisitaDoc {
  vendedorId: string;
  // Foto del vendedor al momento de la visita: la historia no cambia si
  // después cambia de producto, de zona o deja de estar activo. Visitas
  // guardadas antes de este campo lo reciben con backfill-historial.ts; si
  // falta, se usa el dato actual del vendedor.
  vendedorNombre?: string;
  productoId?: string | null;
  productoNombre?: string | null;
  zona?: string | null;
  hubManagerNombre?: string | null;
  // Negocio visitado (ver negocios.ts): junta su historial aunque lo hayan
  // visitado vendedores distintos.
  negocioId?: string | null;
  prospectoId: string | null;
  esNegocioNuevo: boolean;
  nombreNegocio: string;
  direccion: string;
  resultado: string;
  notas: string | null;
  fotos: string[];
  // Ya no se escribe: solo se lee por compatibilidad con visitas guardadas
  // antes de soportar varias fotos por visita.
  fotoUrl?: string | null;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  ubicacionValida: boolean | null;
  distanciaValidacionMetros: number | null;
  createdAt: Timestamp;
}

interface ProspectoDoc {
  vendedorId?: string;
  negocioId?: string;
  nombre: string;
  direccion: string;
  origen?: string;
  lat?: number | null;
  lng?: number | null;
}

function parseCoord(raw: string | undefined, min: number, max: number): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
}

function fotosDeVisita(v: VisitaDoc): string[] {
  return v.fotos && v.fotos.length ? v.fotos : v.fotoUrl ? [v.fotoUrl] : [];
}

function shape(id: string, v: VisitaDoc) {
  return {
    id,
    vendedorId: v.vendedorId,
    negocioId: v.negocioId ?? null,
    prospectoId: v.prospectoId,
    esNegocioNuevo: v.esNegocioNuevo,
    nombreNegocio: v.nombreNegocio,
    direccion: v.direccion,
    resultado: v.resultado,
    notas: v.notas,
    fotos: fotosDeVisita(v),
    lat: v.lat ?? null,
    lng: v.lng ?? null,
    ubicacionValida: v.ubicacionValida ?? null,
    distanciaValidacionMetros: v.distanciaValidacionMetros ?? null,
    createdAt: toIso(v.createdAt),
  };
}

function encodeCursor(createdAt: Timestamp, id: string): string {
  return Buffer.from(`${createdAt.toMillis()}_${id}`, 'utf-8').toString('base64url');
}

function decodeCursor(cursor: string): { millis: number; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf-8');
    const sep = raw.lastIndexOf('_');
    if (sep < 0) return null;
    const millis = Number(raw.slice(0, sep));
    const id = raw.slice(sep + 1);
    return Number.isFinite(millis) && id ? { millis, id } : null;
  } catch {
    return null;
  }
}

interface VendedorActual { nombre: string; productoId: string; activo: boolean }

async function vendedoresPorId(ids: string[]): Promise<Map<string, VendedorActual>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, VendedorActual>();
  await Promise.all(unique.map(async (id) => {
    const doc = await db.collection('vendedores').doc(id).get();
    if (!doc.exists) return;
    const d = doc.data() as { nombre: string; productoId: string; estado?: string };
    map.set(id, { nombre: d.nombre, productoId: d.productoId, activo: d.estado !== 'Baja' });
  }));
  return map;
}

// Visitas con el nombre y producto que tenía el vendedor al hacerlas (o el
// actual, si la visita es anterior a la foto) y si sigue activo hoy.
async function conVendedor<T extends VisitaDoc & { id: string }>(visitas: T[]) {
  const vendedorMap = await vendedoresPorId(visitas.map((v) => v.vendedorId));
  const faltantes = visitas.filter((v) => !v.productoNombre).map((v) => vendedorMap.get(v.vendedorId)?.productoId ?? '');
  const productoNombres = await productosPorId(faltantes.filter(Boolean));
  return visitas.map((v) => {
    const vd = vendedorMap.get(v.vendedorId);
    return {
      id: v.id,
      vendedorId: v.vendedorId,
      vendedorNombre: v.vendedorNombre || vd?.nombre || '—',
      vendedorActivo: vd?.activo ?? false,
      producto: v.productoNombre || (vd ? productoNombres.get(vd.productoId) : null) || '—',
      negocioId: v.negocioId ?? null,
      prospectoId: v.prospectoId ?? null,
      esNegocioNuevo: v.esNegocioNuevo,
      nombreNegocio: v.nombreNegocio,
      direccion: v.direccion,
      resultado: v.resultado,
      notas: v.notas,
      fotos: fotosDeVisita(v),
      lat: v.lat ?? null,
      lng: v.lng ?? null,
      ubicacionValida: v.ubicacionValida ?? null,
      distanciaValidacionMetros: v.distanciaValidacionMetros ?? null,
      createdAt: toIso(v.createdAt),
    };
  });
}

// Últimas visitas a un negocio, de cualquier vendedor (activo o no).
export async function visitasDeNegocio(negocioId: string, limite: number): Promise<(VisitaDoc & { id: string })[]> {
  const snap = await db.collection('visitas').where('negocioId', '==', negocioId)
    .orderBy('createdAt', 'desc').limit(limite).get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as VisitaDoc) }));
}

// Lista de visitas individuales con filtros combinables: uno o varios
// vendedores, uno o varios productos (si no se dan vendedores directamente,
// se resuelve a los vendedores de esos productos), uno o varios resultados,
// y rango de fechas. Paginado con cursor (no offset), porque la colección
// crece sin límite.
visitasRouter.get('/', requireAdmin, async (req, res) => {
  const { vendedorIds, productoIds, resultados, desde, hasta, cursor, limit } = req.query as {
    vendedorIds?: string; productoIds?: string; resultados?: string;
    desde?: string; hasta?: string; cursor?: string; limit?: string;
  };

  const vendedorIdList = parseCsvParam(vendedorIds);
  const productoIdList = parseCsvParam(productoIds);
  const resultadoList = parseCsvParam(resultados);
  const pageSize = Math.max(1, Math.min(100, parseInt(limit || '', 10) || 20));
  const rango = parseDateRangeQuery(desde, hasta);
  const cur = cursor ? decodeCursor(cursor) : null;

  const ids = await resolveVendedorIds(vendedorIdList, productoIdList);
  if (isEmptyRestriction(ids)) return res.json({ items: [], nextCursor: null });

  const idChunks = ids ? chunkArray(ids) : [null];
  // Se pide de más cuando hay filtro de resultado porque Firestore no permite
  // combinar el 'in' de vendedorId con otro filtro de igualdad en la misma
  // consulta sin un índice dedicado; en vez de eso, resultado se filtra en
  // memoria después de traer los datos (mismo patrón que ya usa /evidencias).
  const overfetch = resultadoList.length ? pageSize * 3 : pageSize;

  const chunkResults = await Promise.all(idChunks.map(async (chunkIds) => {
    let query: FirebaseFirestore.Query = db.collection('visitas');
    if (chunkIds) query = query.where('vendedorId', 'in', chunkIds);
    if (rango) query = query.where('createdAt', '>=', Timestamp.fromDate(rango.start)).where('createdAt', '<', Timestamp.fromDate(rango.end));
    query = query.orderBy('createdAt', 'desc').orderBy(FieldPath.documentId(), 'desc');
    if (cur) query = query.startAfter(Timestamp.fromMillis(cur.millis), cur.id);
    const snap = await query.limit(overfetch).get();
    return snap.docs;
  }));

  // Top-K merge: cada bloque ya viene ordenado desc por (createdAt, id), así
  // que cualquier fila que pertenezca al top global también está entre las
  // primeras de su propio bloque — basta con juntarlos todos y reordenar.
  const merged = chunkResults.flat().sort((a, b) => {
    const ta = (a.data().createdAt as Timestamp).toMillis();
    const tb = (b.data().createdAt as Timestamp).toMillis();
    if (tb !== ta) return tb - ta;
    return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
  });

  let visitas = merged.map((d) => ({ id: d.id, ...(d.data() as VisitaDoc) }));
  if (resultadoList.length) visitas = visitas.filter((v) => resultadoList.includes(v.resultado));

  const hasMore = visitas.length > pageSize;
  const pagina = visitas.slice(0, pageSize);
  const ultimo = pagina[pagina.length - 1];
  const nextCursor = hasMore && ultimo ? encodeCursor(ultimo.createdAt, ultimo.id) : null;

  res.json({ items: await conVendedor(pagina), nextCursor });
});

// Historial completo de un negocio (todas sus visitas, de cualquier
// vendedor) y quién lo tiene hoy en su ruta.
const MAX_HISTORIAL_NEGOCIO = 200;

visitasRouter.get('/negocio/:negocioId', requireAdmin, async (req, res) => {
  const { negocioId } = req.params;
  if (!esNegocioIdValido(negocioId)) return res.status(400).json({ error: 'negocio_invalido' });
  const [visitas, prospectosSnap] = await Promise.all([
    visitasDeNegocio(negocioId, MAX_HISTORIAL_NEGOCIO),
    db.collection('prospectos').where('negocioId', '==', negocioId).get(),
  ]);
  const prospectos = prospectosSnap.docs.map((d) => d.data() as ProspectoDoc & { giro?: string | null; telefono?: string | null; estado?: string; fechaPlan?: string | null });
  const ficha = prospectos[0];
  const enRuta = prospectos.find((p) => p.estado === 'por_visitar' && p.vendedorId);
  const vendedorEnRuta = enRuta ? (await vendedoresPorId([enRuta.vendedorId!])).get(enRuta.vendedorId!) : undefined;
  res.json({
    negocioId,
    nombre: ficha?.nombre ?? visitas[0]?.nombreNegocio ?? 'Negocio',
    direccion: ficha?.direccion ?? visitas[0]?.direccion ?? '',
    giro: ficha?.giro ?? null,
    telefono: ficha?.telefono ?? null,
    enRuta: enRuta ? { vendedorNombre: vendedorEnRuta?.nombre ?? '—', fechaPlan: enRuta.fechaPlan ?? null } : null,
    visitas: await conVendedor(visitas),
  });
});

visitasRouter.get('/vendedor/:vendedorId', requireAdmin, async (req, res) => {
  const snap = await db.collection('visitas')
    .where('vendedorId', '==', req.params.vendedorId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  res.json(snap.docs.map((d) => shape(d.id, d.data() as VisitaDoc)));
});

// Las fotos ya no llegan como multipart: la app del vendedor las sube directo
// a Firebase Storage con el SDK cliente (ver apps/seller/src/uploadFotos.ts)
// y aquí solo llegan las URLs resultantes. Esto evita el límite fijo de
// 10 MB por request que impone el rewrite de Firebase Hosting hacia la
// función, que aplicaba sin importar el límite configurado en el servidor.
// Se valida que cada URL sea realmente una descarga de Storage dentro de la
// carpeta del propio vendedor, para que nadie pueda inyectar URLs arbitrarias
// a nombre de otro vendedor.
function fotoUrlValida(url: string, vendedorId: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.hostname !== 'firebasestorage.googleapis.com') return false;
  const [, objectPathRaw] = parsed.pathname.split('/o/');
  if (!objectPathRaw) return false;
  const objectPath = decodeURIComponent(objectPathRaw);
  return objectPath.startsWith(`visitas/${vendedorId}/`);
}

visitasRouter.post('/', async (req, res) => {
  const { vendedorId, prospectoId, esNegocioNuevo, nombreNegocio, direccion, giro, resultado, notas, lat, lng, gpsAccuracy, capturadoEn, reagendarPara, fotos: fotosRaw } = req.body as Record<string, string> & { fotos?: unknown };
  if (!vendedorId || !resultado) return res.status(400).json({ error: 'vendedorId y resultado son requeridos' });
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);

  // La app del vendedor solo permite capturar fotos en el momento (cámara en
  // vivo vía getUserMedia, sin selector de archivos) — se exige al menos una
  // aquí también para que nadie pueda saltarse ese requisito pegándole
  // directo a la API.
  const fotosCandidatas = Array.isArray(fotosRaw) ? fotosRaw.filter((f): f is string => typeof f === 'string') : [];
  if (fotosCandidatas.length === 0) return res.status(400).json({ error: 'foto_requerida', message: 'Al menos una fotografía de evidencia es requerida.' });
  if (fotosCandidatas.length > MAX_FOTOS_POR_VISITA) return res.status(400).json({ error: 'fotos_invalidas', message: `Solo se permiten ${MAX_FOTOS_POR_VISITA} fotografías por visita.` });
  if (!fotosCandidatas.every((url) => fotoUrlValida(url, vendedorId))) return res.status(400).json({ error: 'fotos_invalidas', message: 'No se pudieron procesar las fotografías. Intenta de nuevo.' });

  const gpsLat = parseCoord(lat, -90, 90);
  const gpsLng = parseCoord(lng, -180, 180);
  const hasGps = gpsLat != null && gpsLng != null;

  const esNuevo = esNegocioNuevo === 'true' || esNegocioNuevo === '1';
  const createdAt = parseCapturadoEn(capturadoEn) ?? Timestamp.now();
  const [prospectoDoc, vendedorDoc] = await Promise.all([
    prospectoId ? db.collection('prospectos').doc(prospectoId).get() : null,
    db.collection('vendedores').doc(vendedorId).get(),
  ]);
  let prospecto = prospectoDoc?.exists ? ({ id: prospectoDoc.id, ...(prospectoDoc.data() as ProspectoDoc) }) : null;
  // Solo puede cerrar negocios de su propia ruta.
  if (prospecto && prospecto.vendedorId && prospecto.vendedorId !== vendedorId) prospecto = null;

  if (esNuevo && !prospecto) {
    const nombre = nombreNegocio || 'Nuevo negocio';
    const dir = direccion || 'Ubicación actual';
    const data: ProspectoDoc & { vendedorId: string; negocioId: string; giro?: string; origen: string; estado: string; visitadoEn: Timestamp; createdAt: Timestamp } = {
      vendedorId, negocioId: negocioIdDe({ nombre, direccion: dir, lat: gpsLat, lng: gpsLng }),
      nombre, direccion: dir,
      giro: giro || undefined, origen: 'manual', estado: 'visitado', visitadoEn: createdAt,
      lat: hasGps ? gpsLat : null, lng: hasGps ? gpsLng : null, createdAt: Timestamp.now(),
    };
    const ref = await db.collection('prospectos').add(data);
    prospecto = { id: ref.id, ...data };
  } else if (prospecto) {
    const prospectoRef = db.collection('prospectos').doc(prospecto.id);
    // Prospectos de antes de negocioId lo reciben en su primera visita.
    if (!prospecto.negocioId) {
      prospecto.negocioId = negocioIdDe(prospecto);
      await prospectoRef.update({ negocioId: prospecto.negocioId });
    }
    // "Se reagenda visita" no cierra el negocio: vuelve a su ruta en la
    // fecha que eligió el vendedor (mañana si no eligió ninguna).
    if (resultado === RESULTADO_REAGENDA) {
      const fecha = esFechaIso(reagendarPara) && reagendarPara > fechaMx(createdAt.toDate())
        ? reagendarPara
        : sumarDias(fechaMx(createdAt.toDate()), 1);
      await prospectoRef.update({ estado: 'por_visitar', fechaPlan: fecha, orden: 0, reagendado: true });
    } else {
      await prospectoRef.update({ estado: 'visitado', visitadoEn: createdAt, reagendado: false });
    }
  }

  // Valida la ubicación solo cuando el teléfono entregó GPS real (no la
  // coordenada de respaldo del prospecto, que trivialmente daría distancia 0)
  // y el prospecto viene del DENUE (tiene una ubicación de referencia real de
  // INEGI). Negocios manuales/nuevos no tienen contra qué validar: se dejan
  // en null (no aplica), no en false.
  let ubicacionValida: boolean | null = null;
  let distanciaValidacionMetros: number | null = null;
  if (hasGps && prospecto?.origen === 'denue' && prospecto.lat != null && prospecto.lng != null) {
    const distancia = haversineMetros({ lat: gpsLat!, lng: gpsLng! }, { lat: prospecto.lat, lng: prospecto.lng });
    distanciaValidacionMetros = Math.round(distancia);
    ubicacionValida = distancia <= RADIO_UBICACION_VALIDA_METROS;
  }

  // Si el teléfono no entregó GPS, usamos la ubicación conocida del prospecto
  // (p. ej. coordenadas DENUE) para que la visita siga apareciendo en el mapa de calor.
  const vendedor = vendedorDoc.data() as { nombre?: string; productoId?: string; zona?: string | null; hubManagerNombre?: string | null } | undefined;
  const productoNombre = vendedor?.productoId ? (await productosPorId([vendedor.productoId])).get(vendedor.productoId) ?? null : null;
  const nombreFinal = nombreNegocio || prospecto?.nombre || 'Negocio';
  const direccionFinal = direccion || prospecto?.direccion || '';
  const visitaData: VisitaDoc = {
    vendedorId,
    vendedorNombre: vendedor?.nombre ?? '',
    productoId: vendedor?.productoId ?? null,
    productoNombre,
    zona: vendedor?.zona ?? null,
    hubManagerNombre: vendedor?.hubManagerNombre ?? null,
    negocioId: prospecto?.negocioId ?? negocioIdDe({ nombre: nombreFinal, direccion: direccionFinal, lat: gpsLat, lng: gpsLng }),
    prospectoId: prospecto?.id ?? null,
    esNegocioNuevo: esNuevo,
    nombreNegocio: nombreFinal,
    direccion: direccionFinal,
    resultado,
    notas: notas || null,
    fotos: fotosCandidatas,
    lat: hasGps ? gpsLat : prospecto?.lat ?? null,
    lng: hasGps ? gpsLng : prospecto?.lng ?? null,
    gpsAccuracy: hasGps ? parseCoord(gpsAccuracy, 0, 100000) : null,
    ubicacionValida,
    distanciaValidacionMetros,
    // Una visita registrada sin señal se reenvía después desde la cola local
    // del teléfono; capturadoEn conserva la hora real en que se hizo la visita
    // para que el avance del día y la racha no se muevan al día del reenvío.
    createdAt,
  };
  const ref = await db.collection('visitas').add(visitaData);

  res.status(201).json(shape(ref.id, visitaData));
});

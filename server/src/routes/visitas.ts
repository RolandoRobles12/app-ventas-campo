import { Router } from 'express';
import multer from 'multer';
import { db, Timestamp, FieldPath } from '../db.js';
import { toIso, haversineMetros, chunkArray, parseDateRangeQuery, parseCsvParam, isEmptyRestriction } from '../firestore-helpers.js';
import { saveUpload } from '../storage.js';
import { productosPorId } from './vendedores.js';
import { resolveVendedorIds } from './_filters.js';

export const visitasRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

// Radio dentro del cual la ubicación GPS capturada en la visita se considera
// que corresponde al negocio. Solo aplica a prospectos que vienen del DENUE
// (coordenadas reales de INEGI) — un negocio agregado a mano o "nuevo" no
// tiene una ubicación de referencia contra la cual validar.
const RADIO_UBICACION_VALIDA_METROS = 50;

interface VisitaDoc {
  vendedorId: string;
  prospectoId: string | null;
  esNegocioNuevo: boolean;
  nombreNegocio: string;
  direccion: string;
  resultado: string;
  notas: string | null;
  fotoUrl: string | null;
  lat: number | null;
  lng: number | null;
  gpsAccuracy: number | null;
  ubicacionValida: boolean | null;
  distanciaValidacionMetros: number | null;
  createdAt: Timestamp;
}

interface ProspectoDoc {
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

function shape(id: string, v: VisitaDoc) {
  return {
    id,
    vendedorId: v.vendedorId,
    prospectoId: v.prospectoId,
    esNegocioNuevo: v.esNegocioNuevo,
    nombreNegocio: v.nombreNegocio,
    direccion: v.direccion,
    resultado: v.resultado,
    notas: v.notas,
    fotoUrl: v.fotoUrl,
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

async function vendedoresPorId(ids: string[]): Promise<Map<string, { nombre: string; productoId: string }>> {
  const unique = [...new Set(ids)];
  const map = new Map<string, { nombre: string; productoId: string }>();
  await Promise.all(unique.map(async (id) => {
    const doc = await db.collection('vendedores').doc(id).get();
    if (!doc.exists) return;
    const d = doc.data() as { nombre: string; productoId: string };
    map.set(id, { nombre: d.nombre, productoId: d.productoId });
  }));
  return map;
}

// Lista de visitas individuales con filtros combinables: uno o varios
// vendedores, uno o varios productos (si no se dan vendedores directamente,
// se resuelve a los vendedores de esos productos), uno o varios resultados,
// y rango de fechas. Paginado con cursor (no offset), porque la colección
// crece sin límite.
visitasRouter.get('/', async (req, res) => {
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

  const vendedorMap = await vendedoresPorId(pagina.map((v) => v.vendedorId));
  const productoNombres = await productosPorId([...vendedorMap.values()].map((v) => v.productoId));

  res.json({
    items: pagina.map((v) => {
      const vd = vendedorMap.get(v.vendedorId);
      return {
        id: v.id,
        vendedorId: v.vendedorId,
        vendedorNombre: vd?.nombre ?? '—',
        producto: vd ? productoNombres.get(vd.productoId) ?? '—' : '—',
        esNegocioNuevo: v.esNegocioNuevo,
        nombreNegocio: v.nombreNegocio,
        direccion: v.direccion,
        resultado: v.resultado,
        notas: v.notas,
        fotoUrl: v.fotoUrl,
        lat: v.lat ?? null,
        lng: v.lng ?? null,
        ubicacionValida: v.ubicacionValida ?? null,
        distanciaValidacionMetros: v.distanciaValidacionMetros ?? null,
        createdAt: toIso(v.createdAt),
      };
    }),
    nextCursor,
  });
});

visitasRouter.get('/vendedor/:vendedorId', async (req, res) => {
  const snap = await db.collection('visitas')
    .where('vendedorId', '==', req.params.vendedorId)
    .orderBy('createdAt', 'desc')
    .limit(100)
    .get();
  res.json(snap.docs.map((d) => shape(d.id, d.data() as VisitaDoc)));
});

visitasRouter.post('/', upload.single('foto'), async (req, res) => {
  const { vendedorId, prospectoId, esNegocioNuevo, nombreNegocio, direccion, giro, resultado, notas, lat, lng, gpsAccuracy } = req.body as Record<string, string>;
  if (!vendedorId || !resultado) return res.status(400).json({ error: 'vendedorId y resultado son requeridos' });

  const gpsLat = parseCoord(lat, -90, 90);
  const gpsLng = parseCoord(lng, -180, 180);
  const hasGps = gpsLat != null && gpsLng != null;

  const esNuevo = esNegocioNuevo === 'true' || esNegocioNuevo === '1';
  const prospectoRef = prospectoId ? db.collection('prospectos').doc(prospectoId) : null;
  let prospectoDoc = prospectoRef ? await prospectoRef.get() : null;
  let prospecto = prospectoDoc?.exists ? ({ id: prospectoDoc.id, ...(prospectoDoc.data() as ProspectoDoc) }) : null;

  if (esNuevo && !prospecto) {
    const data: ProspectoDoc & { vendedorId: string; giro?: string; origen: string; estado: string; createdAt: Timestamp } = {
      vendedorId, nombre: nombreNegocio || 'Nuevo negocio', direccion: direccion || 'Ubicación actual',
      giro: giro || undefined, origen: 'manual', estado: 'visitado',
      lat: hasGps ? gpsLat : null, lng: hasGps ? gpsLng : null, createdAt: Timestamp.now(),
    };
    const ref = await db.collection('prospectos').add(data);
    prospecto = { id: ref.id, ...data };
  } else if (prospecto && prospectoRef) {
    await prospectoRef.update({ estado: 'visitado' });
  }

  const fotoUrl = req.file ? await saveUpload(req.file) : null;

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
  const visitaData: VisitaDoc = {
    vendedorId,
    prospectoId: prospecto?.id ?? null,
    esNegocioNuevo: esNuevo,
    nombreNegocio: nombreNegocio || prospecto?.nombre || 'Negocio',
    direccion: direccion || prospecto?.direccion || '',
    resultado,
    notas: notas || null,
    fotoUrl,
    lat: hasGps ? gpsLat : prospecto?.lat ?? null,
    lng: hasGps ? gpsLng : prospecto?.lng ?? null,
    gpsAccuracy: hasGps ? parseCoord(gpsAccuracy, 0, 100000) : null,
    ubicacionValida,
    distanciaValidacionMetros,
    createdAt: Timestamp.now(),
  };
  const ref = await db.collection('visitas').add(visitaData);

  res.status(201).json(shape(ref.id, visitaData));
});

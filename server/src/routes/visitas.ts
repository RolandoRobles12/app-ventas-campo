import { Router } from 'express';
import multer from 'multer';
import { db, Timestamp } from '../db.js';
import { toIso, haversineMetros } from '../firestore-helpers.js';
import { saveUpload } from '../storage.js';

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

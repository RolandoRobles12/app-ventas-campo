import { Router } from 'express';
import multer from 'multer';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';
import { saveUpload } from '../storage.js';

export const visitasRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

interface VisitaDoc {
  vendedorId: string;
  prospectoId: string | null;
  esNegocioNuevo: boolean;
  nombreNegocio: string;
  direccion: string;
  resultado: string;
  notas: string | null;
  fotoUrl: string | null;
  createdAt: Timestamp;
}

interface ProspectoDoc {
  nombre: string;
  direccion: string;
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
  const { vendedorId, prospectoId, esNegocioNuevo, nombreNegocio, direccion, giro, resultado, notas } = req.body as Record<string, string>;
  if (!vendedorId || !resultado) return res.status(400).json({ error: 'vendedorId y resultado son requeridos' });

  const esNuevo = esNegocioNuevo === 'true' || esNegocioNuevo === '1';
  const prospectoRef = prospectoId ? db.collection('prospectos').doc(prospectoId) : null;
  let prospectoDoc = prospectoRef ? await prospectoRef.get() : null;
  let prospecto = prospectoDoc?.exists ? ({ id: prospectoDoc.id, ...(prospectoDoc.data() as ProspectoDoc) }) : null;

  if (esNuevo && !prospecto) {
    const data: ProspectoDoc & { vendedorId: string; giro?: string; origen: string; estado: string; createdAt: Timestamp } = {
      vendedorId, nombre: nombreNegocio || 'Nuevo negocio', direccion: direccion || 'Ubicación actual',
      giro: giro || undefined, origen: 'manual', estado: 'visitado', createdAt: Timestamp.now(),
    };
    const ref = await db.collection('prospectos').add(data);
    prospecto = { id: ref.id, nombre: data.nombre, direccion: data.direccion };
  } else if (prospecto && prospectoRef) {
    await prospectoRef.update({ estado: 'visitado' });
  }

  const fotoUrl = req.file ? await saveUpload(req.file) : null;

  const visitaData: VisitaDoc = {
    vendedorId,
    prospectoId: prospecto?.id ?? null,
    esNegocioNuevo: esNuevo,
    nombreNegocio: nombreNegocio || prospecto?.nombre || 'Negocio',
    direccion: direccion || prospecto?.direccion || '',
    resultado,
    notas: notas || null,
    fotoUrl,
    createdAt: Timestamp.now(),
  };
  const ref = await db.collection('visitas').add(visitaData);

  res.status(201).json(shape(ref.id, visitaData));
});

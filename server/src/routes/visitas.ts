import { Router } from 'express';
import multer from 'multer';
import { prisma } from '../db.js';
import { saveUpload } from '../storage.js';

export const visitasRouter = Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

function shape(v: any) {
  return {
    id: v.id,
    vendedorId: v.vendedorId,
    prospectoId: v.prospectoId,
    esNegocioNuevo: v.esNegocioNuevo,
    nombreNegocio: v.nombreNegocio,
    direccion: v.direccion,
    resultado: v.resultado,
    notas: v.notas,
    fotoUrl: v.fotoUrl,
    createdAt: v.createdAt,
  };
}

visitasRouter.get('/vendedor/:vendedorId', async (req, res) => {
  const visitas = await prisma.visita.findMany({
    where: { vendedorId: req.params.vendedorId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  res.json(visitas.map(shape));
});

visitasRouter.post('/', upload.single('foto'), async (req, res) => {
  const { vendedorId, prospectoId, esNegocioNuevo, nombreNegocio, direccion, giro, resultado, notas } = req.body as Record<string, string>;
  if (!vendedorId || !resultado) return res.status(400).json({ error: 'vendedorId y resultado son requeridos' });

  const esNuevo = esNegocioNuevo === 'true' || esNegocioNuevo === '1';
  let prospecto = prospectoId ? await prisma.prospecto.findUnique({ where: { id: prospectoId } }) : null;

  if (esNuevo && !prospecto) {
    prospecto = await prisma.prospecto.create({
      data: {
        vendedorId, nombre: nombreNegocio || 'Nuevo negocio', direccion: direccion || 'Ubicación actual',
        giro: giro || undefined, origen: 'manual', estado: 'visitado',
      },
    });
  } else if (prospecto) {
    await prisma.prospecto.update({ where: { id: prospecto.id }, data: { estado: 'visitado' } });
  }

  const fotoUrl = req.file ? await saveUpload(req.file) : null;

  const visita = await prisma.visita.create({
    data: {
      vendedorId,
      prospectoId: prospecto?.id,
      esNegocioNuevo: esNuevo,
      nombreNegocio: nombreNegocio || prospecto?.nombre || 'Negocio',
      direccion: direccion || prospecto?.direccion || '',
      resultado,
      notas: notas || null,
      fotoUrl,
    },
  });

  res.status(201).json(shape(visita));
});

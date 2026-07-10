import { Router } from 'express';
import { prisma } from '../db.js';
import { resolveVendedorIds } from './_filters.js';

export const mapaRouter = Router();

mapaRouter.get('/leads', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);

  const prospectos = await prisma.prospecto.findMany({
    where: { ...(ids ? { vendedorId: { in: ids } } : {}), lat: { not: null }, lng: { not: null } },
    include: { vendedor: true },
    orderBy: { createdAt: 'desc' },
    take: 300,
  });

  const [total, porVisitar, visitados] = await Promise.all([
    prisma.prospecto.count({ where: ids ? { vendedorId: { in: ids } } : {} }),
    prisma.prospecto.count({ where: { ...(ids ? { vendedorId: { in: ids } } : {}), estado: 'por_visitar' } }),
    prisma.prospecto.count({ where: { ...(ids ? { vendedorId: { in: ids } } : {}), estado: 'visitado' } }),
  ]);
  const sincronizadosCrm = await prisma.crmDeal.count({ where: { source: 'hubspot' } });

  res.json({
    totales: { total, porVisitar, visitados, sincronizadosCrm },
    leads: prospectos.map((p) => ({
      id: p.id, nombre: p.nombre, direccion: p.direccion, estado: p.estado, lat: p.lat, lng: p.lng,
      vendedor: p.vendedor.nombre, color: p.estado === 'visitado' ? '#22a36c' : '#ef8b3e',
    })),
  });
});

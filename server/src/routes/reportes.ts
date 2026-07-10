import { Router } from 'express';
import { prisma } from '../db.js';
import { resolveVendedorIds } from './_filters.js';

export const reportesRouter = Router();

reportesRouter.get('/summary', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  const where = ids ? { vendedorId: { in: ids } } : {};

  const [visitasTotales, solicitudes, km] = await Promise.all([
    prisma.visita.count({ where }),
    prisma.visita.count({ where: { ...where, resultado: 'Se realizó solicitud' } }),
    prisma.prospecto.aggregate({ where: { ...(ids ? { vendedorId: { in: ids } } : {}), estado: 'visitado' }, _sum: { distanciaKm: true } }),
  ]);
  const conversion = visitasTotales > 0 ? Math.round((solicitudes / visitasTotales) * 100) : 0;

  res.json({
    visitasTotales, solicitudes, conversion,
    kmRecorridos: Math.round((km._sum.distanciaKm || 0) * 10) / 10,
  });
});

reportesRouter.get('/vendedores', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);

  const vendedores = await prisma.vendedor.findMany({ where: ids ? { id: { in: ids } } : {} });
  const out = await Promise.all(vendedores.map(async (v) => {
    const [total, solicitudes, km] = await Promise.all([
      prisma.visita.count({ where: { vendedorId: v.id } }),
      prisma.visita.count({ where: { vendedorId: v.id, resultado: 'Se realizó solicitud' } }),
      prisma.prospecto.aggregate({ where: { vendedorId: v.id, estado: 'visitado' }, _sum: { distanciaKm: true } }),
    ]);
    const w1 = total > 0 ? Math.round((solicitudes / total) * 100) : 0;
    return {
      id: v.id, nombre: v.nombre, total, solicitudes, km: Math.round((km._sum.distanciaKm || 0) * 10) / 10,
      w1: `${w1}%`, w2: `${100 - w1}%`,
    };
  }));
  res.json(out.sort((a, b) => b.total - a.total));
});

reportesRouter.get('/evidencias', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  const visitas = await prisma.visita.findMany({
    where: { ...(ids ? { vendedorId: { in: ids } } : {}), fotoUrl: { not: null } },
    orderBy: { createdAt: 'desc' }, take: 12,
  });
  res.json(visitas.map((v) => ({ id: v.id, nombre: v.nombreNegocio, resultado: v.resultado, fotoUrl: v.fotoUrl, createdAt: v.createdAt })));
});

import { Router } from 'express';
import { prisma } from '../db.js';
import { resolveVendedorIds } from './_filters.js';

export const seguimientoRouter = Router();

seguimientoRouter.get('/', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  const fecha = new Date().toISOString().slice(0, 10);

  const vendedores = await prisma.vendedor.findMany({
    where: { ...(ids ? { id: { in: ids } } : {}) },
    include: { producto: true },
  });

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);

  const out = await Promise.all(vendedores.map(async (v) => {
    const jornada = await prisma.jornada.findUnique({ where: { vendedorId_fecha: { vendedorId: v.id, fecha } } });
    if (!jornada?.activa && !jornada?.horaEntrada) return null; // no ha trabajado hoy: no aparece "en vivo"

    const [realizadas, pendientes] = await Promise.all([
      prisma.visita.count({ where: { vendedorId: v.id, createdAt: { gte: start, lt: end } } }),
      prisma.prospecto.count({ where: { vendedorId: v.id, estado: 'por_visitar' } }),
    ]);
    const totalLista = realizadas + pendientes;
    const pct = totalLista > 0 ? Math.round((realizadas / totalLista) * 100) : 0;
    const ultimaVisita = await prisma.visita.findFirst({ where: { vendedorId: v.id }, orderBy: { createdAt: 'desc' } });
    const kmRecorridos = await prisma.prospecto.aggregate({
      where: { vendedorId: v.id, estado: 'visitado' }, _sum: { distanciaKm: true },
    });

    return {
      id: v.id, nombre: v.nombre, iniciales: v.iniciales, color: v.color, producto: v.producto.nombre, ciudad: v.ciudad,
      inicio: jornada.horaEntrada, estado: jornada.activa ? 'En ruta' : 'Finalizó',
      realizadas, pendientes, pct,
      km: Math.round((kmRecorridos._sum.distanciaKm || 0) * 10) / 10,
      ubicacionActual: ultimaVisita?.nombreNegocio || 'Sin registrar',
    };
  }));

  res.json(out.filter(Boolean));
});

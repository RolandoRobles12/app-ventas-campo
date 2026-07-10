import { Router } from 'express';
import { prisma } from '../db.js';

export const metasRouter = Router();

function monthRange() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return { start, end, periodo: start.toISOString().slice(0, 7) };
}

function dayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, periodo: start.toISOString().slice(0, 10) };
}

// Avance real: solicitudes de hoy se cuentan de las visitas capturadas por el
// vendedor con resultado "Se realizó solicitud"; colocación del mes se suma de
// los deals de CRM del vendedor que llegaron a la etapa "Desembolso" este mes.
metasRouter.get('/:vendedorId/hoy', async (req, res) => {
  const vendedorId = req.params.vendedorId;
  const { start: dayStart, end: dayEnd, periodo: diaPeriodo } = dayRange();
  const { start: monthStart, end: monthEnd, periodo: mesPeriodo } = monthRange();

  const [solicitudesHoy, metaSolicitudes, colocaciones, metaColocacion] = await Promise.all([
    prisma.visita.count({
      where: { vendedorId, resultado: 'Se realizó solicitud', createdAt: { gte: dayStart, lt: dayEnd } },
    }),
    prisma.meta.findUnique({ where: { vendedorId_tipo_periodo: { vendedorId, tipo: 'solicitudes_hoy', periodo: diaPeriodo } } }),
    prisma.crmDeal.findMany({
      where: { dealOwnerId: vendedorId, etapa: 'Desembolso', createdAt: { gte: monthStart, lt: monthEnd } },
      select: { amount: true },
    }),
    prisma.meta.findUnique({ where: { vendedorId_tipo_periodo: { vendedorId, tipo: 'colocacion_mes', periodo: mesPeriodo } } }),
  ]);

  const colocacionMes = colocaciones.reduce((sum, d) => sum + (d.amount || 0), 0);

  res.json({
    solicitudesHoy: { actual: solicitudesHoy, meta: metaSolicitudes?.valorMeta ?? 5 },
    colocacionMes: { actual: colocacionMes, meta: metaColocacion?.valorMeta ?? 120000 },
  });
});

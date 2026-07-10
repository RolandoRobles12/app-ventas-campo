import { Router } from 'express';
import { prisma } from '../db.js';

export const jornadaRouter = Router();

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowHM(): string {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

async function getOrCreateHoy(vendedorId: string) {
  const fecha = today();
  let j = await prisma.jornada.findUnique({ where: { vendedorId_fecha: { vendedorId, fecha } } });
  if (!j) {
    j = await prisma.jornada.create({ data: { vendedorId, fecha } });
  }
  return j;
}

async function visitasHoyCount(vendedorId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return prisma.visita.count({ where: { vendedorId, createdAt: { gte: start } } });
}

// Racha real: días consecutivos (terminando hoy o ayer) en los que el vendedor
// registró al menos una visita.
async function calcularRacha(vendedorId: string): Promise<number> {
  const jornadas = await prisma.jornada.findMany({
    where: { vendedorId, horaEntrada: { not: null } },
    orderBy: { fecha: 'desc' },
    take: 60,
    select: { fecha: true },
  });
  const dias = new Set(jornadas.map((j) => j.fecha));
  let racha = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // si hoy aún no hay jornada, la racha se cuenta desde ayer
  if (!dias.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (dias.has(cursor.toISOString().slice(0, 10))) {
    racha++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return racha;
}

jornadaRouter.get('/:vendedorId/hoy', async (req, res) => {
  const j = await getOrCreateHoy(req.params.vendedorId);
  const [visitasHoy, racha] = await Promise.all([
    visitasHoyCount(req.params.vendedorId),
    calcularRacha(req.params.vendedorId),
  ]);
  res.json({ ...j, visitasHoy, racha });
});

jornadaRouter.post('/:vendedorId/toggle', async (req, res) => {
  const j = await getOrCreateHoy(req.params.vendedorId);
  const data: any = { activa: !j.activa };
  if (!j.activa) {
    // iniciando jornada
    if (!j.horaEntrada) data.horaEntrada = nowHM();
  } else {
    // finalizando jornada
    data.horaSalida = nowHM();
  }
  const updated = await prisma.jornada.update({ where: { id: j.id }, data });
  const visitasHoy = await visitasHoyCount(req.params.vendedorId);
  res.json({ ...updated, visitasHoy });
});

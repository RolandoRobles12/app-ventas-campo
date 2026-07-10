import { Router } from 'express';
import { db, Timestamp } from '../db.js';

export const metasRouter = Router();

interface MetaDoc {
  vendedorId: string;
  tipo: string;
  periodo: string;
  valorActual: number;
  valorMeta: number;
}

interface CrmDealDoc {
  dealOwnerId?: string | null;
  etapa: string;
  amount?: number | null;
  createdAt: Timestamp;
}

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

function metaId(vendedorId: string, tipo: string, periodo: string) {
  return `${vendedorId}_${tipo}_${periodo}`;
}

// Avance real: solicitudes de hoy se cuentan de las visitas capturadas por el
// vendedor con resultado "Se realizó solicitud"; colocación del mes se suma de
// los deals de CRM del vendedor que llegaron a la etapa "Desembolso" este mes.
metasRouter.get('/:vendedorId/hoy', async (req, res) => {
  const vendedorId = req.params.vendedorId;
  const { start: dayStart, end: dayEnd, periodo: diaPeriodo } = dayRange();
  const { start: monthStart, end: monthEnd, periodo: mesPeriodo } = monthRange();

  const [solicitudesHoySnap, metaSolicitudesDoc, colocacionesSnap, metaColocacionDoc] = await Promise.all([
    db.collection('visitas')
      .where('vendedorId', '==', vendedorId)
      .where('resultado', '==', 'Se realizó solicitud')
      .where('createdAt', '>=', Timestamp.fromDate(dayStart))
      .where('createdAt', '<', Timestamp.fromDate(dayEnd))
      .count()
      .get(),
    db.collection('metas').doc(metaId(vendedorId, 'solicitudes_hoy', diaPeriodo)).get(),
    db.collection('crmDeals')
      .where('dealOwnerId', '==', vendedorId)
      .where('etapa', '==', 'Desembolso')
      .where('createdAt', '>=', Timestamp.fromDate(monthStart))
      .where('createdAt', '<', Timestamp.fromDate(monthEnd))
      .get(),
    db.collection('metas').doc(metaId(vendedorId, 'colocacion_mes', mesPeriodo)).get(),
  ]);

  const solicitudesHoy = solicitudesHoySnap.data().count;
  const metaSolicitudes = metaSolicitudesDoc.data() as MetaDoc | undefined;
  const metaColocacion = metaColocacionDoc.data() as MetaDoc | undefined;
  const colocacionMes = colocacionesSnap.docs.reduce((sum, d) => sum + ((d.data() as CrmDealDoc).amount || 0), 0);

  res.json({
    solicitudesHoy: { actual: solicitudesHoy, meta: metaSolicitudes?.valorMeta ?? 5 },
    colocacionMes: { actual: colocacionMes, meta: metaColocacion?.valorMeta ?? 120000 },
  });
});

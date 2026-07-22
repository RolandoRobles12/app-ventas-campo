import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import type { VendedorDoc } from './vendedores.js';

export const metasRouter = Router();

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
  return { start, end };
}

function dayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end };
}

// Avance real: solicitudes de hoy se cuentan de las visitas capturadas por el
// vendedor con resultado "Se realizó solicitud"; colocación del mes se suma de
// los deals de CRM del vendedor que llegaron a la etapa "Desembolso" este mes.
// La meta (el objetivo) la define el admin una sola vez por vendedor —ver PUT
// abajo— y vive directo en su documento, no por periodo: el objetivo de "hoy"
// es el mismo día tras día hasta que alguien lo cambie.
metasRouter.get('/:vendedorId/hoy', async (req, res) => {
  const vendedorId = req.params.vendedorId;
  const { start: dayStart, end: dayEnd } = dayRange();
  const { start: monthStart, end: monthEnd } = monthRange();

  const [solicitudesHoySnap, vendedorDoc, colocacionesSnap] = await Promise.all([
    db.collection('visitas')
      .where('vendedorId', '==', vendedorId)
      .where('resultado', '==', 'Se realizó solicitud')
      .where('createdAt', '>=', Timestamp.fromDate(dayStart))
      .where('createdAt', '<', Timestamp.fromDate(dayEnd))
      .count()
      .get(),
    db.collection('vendedores').doc(vendedorId).get(),
    db.collection('crmDeals')
      .where('dealOwnerId', '==', vendedorId)
      .where('etapa', '==', 'Desembolso')
      .where('createdAt', '>=', Timestamp.fromDate(monthStart))
      .where('createdAt', '<', Timestamp.fromDate(monthEnd))
      .get(),
  ]);

  const solicitudesHoy = solicitudesHoySnap.data().count;
  const vendedor = vendedorDoc.data() as VendedorDoc | undefined;
  const colocacionMes = colocacionesSnap.docs.reduce((sum, d) => sum + ((d.data() as CrmDealDoc).amount || 0), 0);

  res.json({
    solicitudesHoy: { actual: solicitudesHoy, meta: vendedor?.metaSolicitudesDia ?? 5 },
    colocacionMes: { actual: colocacionMes, meta: vendedor?.metaVentaMes ?? 120000 },
  });
});

// Admin: define (o actualiza) las metas de solicitudes/día y venta/mes de un
// vendedor. Se guardan directo en su documento en vez de en un doc por
// periodo, para no tener que re-capturarlas cada día/mes.
metasRouter.put('/:vendedorId', async (req, res) => {
  const { metaSolicitudesDia, metaVentaMes } = req.body as { metaSolicitudesDia?: number; metaVentaMes?: number };

  const data: Record<string, unknown> = {};
  if (metaSolicitudesDia != null) {
    if (typeof metaSolicitudesDia !== 'number' || !Number.isFinite(metaSolicitudesDia) || metaSolicitudesDia < 0) {
      return res.status(400).json({ error: 'metaSolicitudesDia inválida' });
    }
    data.metaSolicitudesDia = metaSolicitudesDia;
  }
  if (metaVentaMes != null) {
    if (typeof metaVentaMes !== 'number' || !Number.isFinite(metaVentaMes) || metaVentaMes < 0) {
      return res.status(400).json({ error: 'metaVentaMes inválida' });
    }
    data.metaVentaMes = metaVentaMes;
  }
  if (Object.keys(data).length === 0) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  const ref = db.collection('vendedores').doc(req.params.vendedorId);
  const doc = await ref.get();
  if (!doc.exists) return res.status(404).json({ error: 'not_found' });

  await ref.update(data);
  const v = { ...(doc.data() as VendedorDoc), ...data };
  res.json({ id: doc.id, metaSolicitudesDia: v.metaSolicitudesDia ?? 5, metaVentaMes: v.metaVentaMes ?? 120000 });
});

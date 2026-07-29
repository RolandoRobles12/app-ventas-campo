import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { requireAdmin, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { isHubspotConfigured, fetchProductividadVendedor } from '../integrations/hubspot.js';
import type { VendedorDoc } from './vendedores.js';

export const metasRouter = Router();

const MX_TZ = 'America/Mexico_City';

// Convierte un año/mes/día/hora, interpretados en `timeZone`, al instante
// UTC real que representan. Hace falta porque "hoy" y "este mes" deben
// calcularse en hora de México (igual que el script de referencia con
// zoneinfo), no en la hora del servidor — Cloud Functions corre en UTC, así
// que sin esto la medianoche del corte quedaría movida varias horas.
function zonaAUtc(y: number, m: number, d: number, hh: number, mm: number, ss: number, timeZone: string): Date {
  const guess = new Date(Date.UTC(y, m - 1, d, hh, mm, ss));
  const partes = new Intl.DateTimeFormat('en-US', {
    timeZone, hourCycle: 'h23',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(guess);
  const get = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  const comoSiUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return new Date(guess.getTime() - (comoSiUtc - guess.getTime()));
}

// Fecha de hoy (año/mes/día) tal como se ve en `timeZone`, sin importar en
// qué zona corra el proceso.
function hoyEnZona(timeZone: string): { year: number; month: number; day: number } {
  const partes = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const get = (t: string) => Number(partes.find((p) => p.type === t)!.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

// Rangos [inicio, fin) de "hoy" y "este mes" en hora de México — los mismos
// que usa el script de referencia (createdate de hoy / entrada a Desembolso
// de este mes), para consultar HubSpot en vivo.
function rangosMexico() {
  const { year, month, day } = hoyEnZona(MX_TZ);
  const dayStart = zonaAUtc(year, month, day, 0, 0, 0, MX_TZ);
  const dayEnd = zonaAUtc(year, month, day + 1, 0, 0, 0, MX_TZ);
  const monthStart = zonaAUtc(year, month, 1, 0, 0, 0, MX_TZ);
  const monthEnd = month === 12 ? zonaAUtc(year + 1, 1, 1, 0, 0, 0, MX_TZ) : zonaAUtc(year, month + 1, 1, 0, 0, 0, MX_TZ);
  return { dayStart, dayEnd, monthStart, monthEnd };
}

// Días consecutivos (terminando hoy o ayer) en los que el vendedor registró
// al menos una visita — antes se calculaba de `jornadas.horaEntrada`, pero
// esa colección se quitó junto con la pantalla de Jornada.
async function calcularRacha(vendedorId: string): Promise<number> {
  const desde = new Date();
  desde.setDate(desde.getDate() - 60);
  desde.setHours(0, 0, 0, 0);
  const snap = await db.collection('visitas')
    .where('vendedorId', '==', vendedorId)
    .where('createdAt', '>=', Timestamp.fromDate(desde))
    .get();
  const dias = new Set(snap.docs.map((d) => (d.data().createdAt as Timestamp).toDate().toISOString().slice(0, 10)));

  let racha = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // si hoy aún no hay visita, la racha se cuenta desde ayer
  if (!dias.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (dias.has(cursor.toISOString().slice(0, 10))) {
    racha++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return racha;
}

// Avance real: es productividad de HubSpot, independiente de las visitas a
// prospectos que el vendedor registra en la app (esa es otra métrica aparte,
// no se tocan entre sí). Solicitudes de hoy = deals creados hoy en HubSpot
// para el owner de ese vendedor; colocación del mes = suma de los deals que
// entraron a la etapa Desembolso este mes — ambos consultados en vivo contra
// HubSpot (ver fetchProductividadVendedor en integrations/hubspot.ts), igual
// que hace el script de referencia: sin depender de crmDeals ni de la
// sincronización manual de la página de CRM Prospectos. La meta (el
// objetivo) la define el admin una sola vez por vendedor —ver PUT abajo— y
// vive directo en su documento, no por periodo: el objetivo de "hoy" es el
// mismo día tras día hasta que alguien lo cambie.
metasRouter.get('/:vendedorId/hoy', async (req, res) => {
  const vendedorId = req.params.vendedorId;
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);

  const [vendedorDoc, racha] = await Promise.all([
    db.collection('vendedores').doc(vendedorId).get(),
    calcularRacha(vendedorId),
  ]);
  const vendedor = vendedorDoc.data() as VendedorDoc | undefined;

  let solicitudesHoy = 0;
  let colocacionMes = 0;
  // Sin email de vendedor, o sin HubSpot configurado, no hay con qué
  // resolver su owner — se queda en 0 en vez de tronar el home completo.
  if (vendedor?.email && isHubspotConfigured()) {
    try {
      const productividad = await fetchProductividadVendedor(vendedor.email, rangosMexico());
      solicitudesHoy = productividad.solicitudesHoy;
      colocacionMes = productividad.colocacionMes.amount;
    } catch (err: any) {
      // Un hiccup de HubSpot no debe tumbar el home del vendedor — se loguea
      // para diagnóstico y se muestra 0 en vez de un 500.
      console.error(`No se pudo consultar productividad de HubSpot para vendedor ${vendedorId}:`, err?.message || err);
    }
  }

  res.json({
    solicitudesHoy: { actual: solicitudesHoy, meta: vendedor?.metaSolicitudesDia ?? 5 },
    colocacionMes: { actual: colocacionMes, meta: vendedor?.metaVentaMes ?? 120000 },
    racha,
  });
});

// Admin: define (o actualiza) las metas de solicitudes/día y venta/mes de un
// vendedor. Se guardan directo en su documento en vez de en un doc por
// periodo, para no tener que re-capturarlas cada día/mes.
metasRouter.put('/:vendedorId', requireAdmin, async (req, res) => {
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

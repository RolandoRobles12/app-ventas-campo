import { Router } from 'express';
import { db } from '../db.js';
import { isAdminEmail, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { hoyMx, inicioDiaMx } from '../fechas.js';
import { inicioDelDiaDe, ligar, opcionesParaLigar, SOLICITUD } from '../solicitudes.js';

// Atribución de solicitudes de HubSpot a visitas (ver solicitudes.ts).
//   - GET  /vendedor/:id[?visitaId=&fresco=1] → las solicitudes que puede
//     elegir: las de hoy, o las del día de esa visita en adelante.
//   - POST /ligar { visitaId, dealId }        → liga una visita ya guardada
//     (el vendedor la suya; el admin cualquiera).
export const solicitudesRouter = Router();

const MENSAJES = {
  ocupada: 'Esa solicitud ya está ligada a otra visita.',
  no_es_suya: 'Esa solicitud no es tuya en HubSpot.',
  no_encontrada: 'No encontramos esa solicitud.',
  error: 'No pudimos revisar HubSpot ahora. Intenta en un momento.',
} as const;

solicitudesRouter.get('/vendedor/:vendedorId', async (req, res) => {
  const { vendedorId } = req.params;
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);
  const { visitaId, fresco } = req.query as { visitaId?: string; fresco?: string };
  let desde = inicioDiaMx(hoyMx()).getTime();
  if (visitaId) {
    const v = (await db.collection('visitas').doc(visitaId).get()).data();
    if (!v || v.vendedorId !== vendedorId) return res.status(404).json({ error: 'NOT_FOUND', message: 'No encontramos esa visita.' });
    desde = inicioDelDiaDe(v.createdAt.toMillis());
  }
  res.json(await opcionesParaLigar(vendedorId, desde, fresco === '1'));
});

solicitudesRouter.post('/ligar', async (req, res) => {
  const { visitaId, dealId } = req.body as { visitaId?: string; dealId?: string };
  if (!visitaId || typeof dealId !== 'string' || !/^\d{1,20}$/.test(dealId)) return res.status(400).json({ error: 'DATOS_INVALIDOS', message: 'Elige una solicitud.' });
  const v = (await db.collection('visitas').doc(visitaId).get()).data();
  if (!v || v.resultado !== SOLICITUD) return res.status(404).json({ error: 'NOT_FOUND', message: 'No encontramos esa visita.' });
  const esAdmin = await isAdminEmail(req.user!.email);
  if (!esAdmin && !(await puedeActuarComoVendedor(req.user!.email, v.vendedorId))) return vendedorAjeno(res);
  const r = await ligar(visitaId, dealId, esAdmin ? 'admin' : 'vendedor');
  if (!r.ok) return res.status(r.motivo === 'error' ? 502 : 409).json({ error: r.motivo.toUpperCase(), message: MENSAJES[r.motivo] });
  res.json({ ok: true, nombre: r.nombre });
});

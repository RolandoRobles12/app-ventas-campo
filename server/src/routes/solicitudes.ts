import { Router } from 'express';
import { db } from '../db.js';
import { isAdminEmail, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { hoyMx, inicioDiaMx } from '../fechas.js';
import { corregirResultado, CORRECCIONES, descartarSinVisita, inicioDelDiaDe, ligar, opcionesParaLigar, SOLICITUD } from '../solicitudes.js';

// Atribución de solicitudes de HubSpot a visitas (ver solicitudes.ts).
//   - GET  /vendedor/:id[?visitaId=&fresco=1] → las solicitudes que puede
//     elegir: las de hoy, o las del día de esa visita en adelante.
//   - POST /ligar { visitaId, dealId }        → liga una visita ya guardada
//     (el vendedor la suya; el admin cualquiera).
export const solicitudesRouter = Router();

const MENSAJES = {
  ocupada: 'Esa solicitud ya está ligada a otra visita.',
  no_es_suya: 'Esa solicitud no es tuya.',
  no_encontrada: 'No encontramos esa solicitud.',
  error: 'No pudimos revisar las solicitudes ahora. Intenta en un momento.',
  no_corregible: 'Esa visita no se puede cambiar a "Hizo solicitud".',
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

// `corregirResultado`: la visita se tipificó con otro resultado (la
// solicitud quedó sin visita) y pasa a "Hizo solicitud".
solicitudesRouter.post('/ligar', async (req, res) => {
  const { visitaId, dealId, corregirResultado: corregir } = req.body as { visitaId?: string; dealId?: string; corregirResultado?: boolean };
  if (!visitaId || typeof dealId !== 'string' || !/^\d{1,20}$/.test(dealId)) return res.status(400).json({ error: 'DATOS_INVALIDOS', message: 'Elige una solicitud.' });
  const v = (await db.collection('visitas').doc(visitaId).get()).data();
  if (!v || (v.resultado !== SOLICITUD && corregir !== true)) return res.status(404).json({ error: 'NOT_FOUND', message: 'No encontramos esa visita.' });
  const esAdmin = await isAdminEmail(req.user!.email);
  if (!esAdmin && !(await puedeActuarComoVendedor(req.user!.email, v.vendedorId))) return vendedorAjeno(res);
  const r = await ligar(visitaId, dealId, esAdmin ? 'admin' : 'vendedor', undefined, corregir === true);
  if (!r.ok) return res.status(r.motivo === 'error' ? 502 : 409).json({ error: r.motivo.toUpperCase(), message: MENSAJES[r.motivo] });
  res.json({ ok: true, nombre: r.nombre });
});

// "Hizo solicitud" que no lo fue: corrige el resultado de su visita.
solicitudesRouter.post('/corregir', async (req, res) => {
  const { visitaId, resultado } = req.body as { visitaId?: string; resultado?: string };
  if (!visitaId || !resultado || !CORRECCIONES.includes(resultado)) return res.status(400).json({ error: 'DATOS_INVALIDOS', message: 'Elige el resultado correcto.' });
  const v = (await db.collection('visitas').doc(visitaId).get()).data();
  if (!v) return res.status(404).json({ error: 'NOT_FOUND', message: 'No encontramos esa visita.' });
  if (!(await isAdminEmail(req.user!.email)) && !(await puedeActuarComoVendedor(req.user!.email, v.vendedorId))) return vendedorAjeno(res);
  if (!(await corregirResultado(visitaId, resultado))) return res.status(409).json({ error: 'NO_CORREGIBLE', message: 'Esa visita ya tiene su solicitud o no era "Hizo solicitud".' });
  res.json({ ok: true });
});

// Una solicitud sin visita que no fue en una visita (p. ej. por teléfono).
solicitudesRouter.post('/sin-visita/descartar', async (req, res) => {
  const { vendedorId, dealId } = req.body as { vendedorId?: string; dealId?: string };
  if (!vendedorId || typeof dealId !== 'string' || !/^\d{1,20}$/.test(dealId)) return res.status(400).json({ error: 'DATOS_INVALIDOS', message: 'Datos inválidos.' });
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);
  await descartarSinVisita(vendedorId, dealId);
  res.status(204).end();
});

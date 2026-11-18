import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { guardarConfigApp, leerConfigApp, normalizarRadio, RADIO_CERCO_MAX, RADIO_CERCO_MIN } from '../configApp.js';

// GET: cualquiera con sesión (la app del vendedor necesita el radio del
// cerco para bloquear antes de enviar). PUT: solo admin.
export const configRouter = Router();

configRouter.get('/', async (_req, res) => {
  res.json(await leerConfigApp());
});

configRouter.put('/', requireAdmin, async (req, res) => {
  const radio = normalizarRadio(req.body?.radioCercoMetros);
  if (radio == null) {
    return res.status(400).json({ error: 'CONFIG_INVALIDA', message: `La distancia debe estar entre ${RADIO_CERCO_MIN} y ${RADIO_CERCO_MAX} metros.` });
  }
  res.json(await guardarConfigApp({ radioCercoMetros: radio }, req.user!.email));
});

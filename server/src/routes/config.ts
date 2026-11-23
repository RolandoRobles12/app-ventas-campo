import { Router } from 'express';
import { requireAdmin } from '../auth.js';
import { guardarConfigApp, leerConfigApp, normalizarPorcentaje, normalizarRadio, RADIO_CERCO_MAX, RADIO_CERCO_MIN, type ConfigApp } from '../configApp.js';

// GET: cualquiera con sesión (la app del vendedor necesita el radio del
// cerco para bloquear antes de enviar, y el % de sesiones que se graban).
// PUT: solo admin; se cambia solo lo que venga en el body.
export const configRouter = Router();

configRouter.get('/', async (_req, res) => {
  res.json(await leerConfigApp());
});

configRouter.put('/', requireAdmin, async (req, res) => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const cambio: Partial<ConfigApp> = {};
  if (body.radioCercoMetros !== undefined) {
    const radio = normalizarRadio(body.radioCercoMetros);
    if (radio == null) {
      return res.status(400).json({ error: 'CONFIG_INVALIDA', message: `La distancia debe estar entre ${RADIO_CERCO_MIN} y ${RADIO_CERCO_MAX} metros.` });
    }
    cambio.radioCercoMetros = radio;
  }
  if (body.grabacionPorcentaje !== undefined) {
    const pct = normalizarPorcentaje(body.grabacionPorcentaje);
    if (pct == null) return res.status(400).json({ error: 'CONFIG_INVALIDA', message: 'El porcentaje de sesiones grabadas debe estar entre 0 y 100.' });
    cambio.grabacionPorcentaje = pct;
  }
  if (!Object.keys(cambio).length) return res.status(400).json({ error: 'CONFIG_INVALIDA', message: 'No hay nada que cambiar.' });
  res.json(await guardarConfigApp(cambio, req.user!.email));
});

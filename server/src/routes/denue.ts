import { Router } from 'express';
import { consultarDenue, isDenueConfigured } from '../integrations/denue.js';

export const denueRouter = Router();

denueRouter.get('/status', (_req, res) => {
  res.json({ configured: isDenueConfigured() });
});

denueRouter.post('/consulta', async (req, res) => {
  if (!isDenueConfigured()) {
    return res.status(501).json({
      error: 'DENUE_NOT_CONFIGURED',
      message: 'Configura DENUE_TOKEN en el servidor para consultar el API real del DENUE (INEGI).',
    });
  }
  const { giros, ciudad, colonia, cantidad } = req.body as { giros: string[]; ciudad: string; colonia?: string; cantidad: number };
  if (!ciudad) return res.status(400).json({ error: 'ciudad es requerida' });
  try {
    const resultados = await consultarDenue({ giros: giros || [], ciudad, colonia, cantidad: cantidad || 10 });
    res.json({ resultados });
  } catch (err: any) {
    res.status(502).json({ error: 'DENUE_REQUEST_FAILED', message: err?.message || 'Error consultando el DENUE' });
  }
});

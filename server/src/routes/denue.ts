import { Router } from 'express';
import { consultarDenue, isDenueConfigured, type UbicacionZona, type UbicacionGps } from '../integrations/denue.js';

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
  const { giros, cantidad, ciudad, colonia, lat, lng, radioMetros } = req.body as {
    giros: string[]; cantidad: number;
    ciudad?: string; colonia?: string;
    lat?: number; lng?: number; radioMetros?: number;
  };

  let ubicacion: UbicacionZona | UbicacionGps;
  if (lat != null && lng != null) {
    ubicacion = { modo: 'gps', lat, lng, radioMetros } satisfies UbicacionGps;
  } else if (ciudad) {
    ubicacion = { modo: 'zona', ciudad, colonia } satisfies UbicacionZona;
  } else {
    return res.status(400).json({ error: 'Falta ciudad o lat/lng' });
  }

  try {
    const resultados = await consultarDenue({ giros: giros || [], cantidad: cantidad || 10, ubicacion });
    res.json({ resultados });
  } catch (err: any) {
    res.status(502).json({ error: 'DENUE_REQUEST_FAILED', message: err?.message || 'Error consultando el DENUE' });
  }
});

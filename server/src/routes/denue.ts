import { Router } from 'express';
import { consultarDenue, isDenueConfigured, type UbicacionGps } from '../integrations/denue.js';
import { geocodificar, isGoogleMapsConfigured } from '../integrations/googleMaps.js';

export const denueRouter = Router();

denueRouter.get('/status', (_req, res) => {
  res.json({ configured: isDenueConfigured(), googleMapsConfigured: isGoogleMapsConfigured() });
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

  let ubicacion: UbicacionGps;
  if (lat != null && lng != null) {
    ubicacion = { lat, lng, radioMetros };
  } else if (ciudad || colonia) {
    try {
      // Cualquier combinación sirve: solo C.P., solo colonia, solo ciudad, o
      // varias — Google resuelve lo que le des. No agregamos "México" como
      // texto: geocodificar() ya restringe con components=country:MX, y
      // "México" es AMBIGUO en geografía mexicana (es tanto el país como el
      // nombre del Estado de México, distinto de Ciudad de México) — como
      // texto libre puede hacer que Google resuelva un C.P. de CDMX dentro
      // del Estado de México y devuelva un punto sin relación real.
      const texto = [colonia, ciudad].filter(Boolean).join(', ');
      const geo = await geocodificar(texto);
      if (!geo) {
        return res.status(404).json({ error: 'UBICACION_NO_ENCONTRADA', message: `No se encontró "${texto}". Intenta ser más específico (ej. agrega el estado).` });
      }
      console.log(`DENUE: "${texto}" -> ${geo.direccionFormateada} (${geo.lat}, ${geo.lng})`);
      // Sin C.P./colonia (radio amplio para cubrir el municipio completo) vs.
      // con un punto más preciso (colonia aledaña al kiosco, radio más cerrado).
      ubicacion = { lat: geo.lat, lng: geo.lng, radioMetros: radioMetros ?? (colonia ? 2500 : 6000) };
    } catch (err: any) {
      if (err.message === 'GOOGLE_MAPS_NOT_CONFIGURED') {
        return res.status(501).json({ error: 'GOOGLE_MAPS_NOT_CONFIGURED', message: 'Configura GOOGLE_MAPS_API_KEY en el servidor para buscar por municipio/colonia/C.P.' });
      }
      return res.status(502).json({ error: 'GOOGLE_MAPS_REQUEST_FAILED', message: err?.message || 'Error geocodificando la zona' });
    }
  } else {
    return res.status(400).json({ error: 'Falta ciudad, colonia o lat/lng' });
  }

  try {
    const resultados = await consultarDenue({ giros: giros || [], cantidad: cantidad || 10, ubicacion });
    console.log(`DENUE: ${resultados.length} resultados en radio ${ubicacion.radioMetros || 1500}m alrededor de (${ubicacion.lat}, ${ubicacion.lng}), giros=${(giros || []).join('|')}`);
    res.json({ resultados });
  } catch (err: any) {
    res.status(502).json({ error: 'DENUE_REQUEST_FAILED', message: err?.message || 'Error consultando el DENUE' });
  }
});

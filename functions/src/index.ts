import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';

// El código de server/src se copia a ./_server antes de compilar (ver
// scripts/copy-server-src.mjs) y se compila junto con este archivo — no es
// un paquete npm aparte, así que no hay ninguna dependencia que Cloud Build
// tenga que resolver por fuera de esta misma carpeta.
//
// El import sigue siendo perezoso (dentro del handler, no a nivel de módulo
// con un top-level await): si _server/app.js fallara en cargar
// sincrónicamente, Cloud Run nunca llegaría a abrir el puerto y el
// healthcheck fallaría sin ningún log útil ("container failed to start").
// Así, el proceso siempre arranca y escucha; si falla al importarse, el
// error queda registrado en Cloud Logging y se responde 500 en vez de
// tumbar el contenedor completo.
let appPromise: ReturnType<typeof loadApp> | null = null;
function loadApp() {
  return import('./_server/app.js').then((m) => m.app);
}

export const api = onRequest(async (req, res) => {
  try {
    if (!appPromise) appPromise = loadApp();
    const app = await appPromise;
    app(req, res);
  } catch (err) {
    appPromise = null;
    console.error('No se pudo cargar _server/app.js:', err);
    res.status(500).json({ error: 'server_load_failed', message: err instanceof Error ? err.message : String(err) });
  }
});

// Trae deals de HubSpot a Firestore cada 30 min, sin que nadie tenga que
// entrar a la página de CRM del admin y darle a "Sincronizar" a mano — de
// eso dependen "solicitudes hoy" y "colocación del mes" del home del
// vendedor (GET /metas/:vendedorId/hoy en _server/routes/metas.ts), que
// leen de la copia local en `crmDeals`, no de HubSpot en vivo.
// timeoutSeconds más alto que el default (60s): la sincronización hace un
// read+write de Firestore por cada deal, uno por uno, así que una cuenta con
// varios cientos de deals puede tardar más de un minuto.
export const syncHubspotDealsScheduled = onSchedule({ schedule: '*/30 * * * *', timeoutSeconds: 300 }, async () => {
  const { syncHubspotDeals } = await import('./_server/routes/crm.js');
  const { isHubspotConfigured } = await import('./_server/integrations/hubspot.js');
  if (!isHubspotConfigured()) {
    console.log('HubSpot no configurado (falta HUBSPOT_TOKEN) — se omite la sincronización programada.');
    return;
  }
  try {
    const result = await syncHubspotDeals();
    console.log(`Sincronización de HubSpot (cron): ${result.created} creados, ${result.updated} actualizados, ${result.total} totales.`);
  } catch (err) {
    console.error('Sincronización de HubSpot (cron) falló:', err);
  }
});

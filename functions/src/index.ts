import { onRequest } from 'firebase-functions/v2/https';

// Cloud Functions no tiene disco persistente: las fotos de visitas deben
// guardarse en Firebase Storage en vez de server/uploads.
process.env.STORAGE_DRIVER ??= 'firebase';

// El import de @aviva/server se hace perezoso (dentro del handler, no a
// nivel de módulo con un top-level await): si este archivo fallara en
// cargar sincrónicamente, Cloud Run nunca llega a abrir el puerto y el
// healthcheck falla sin ningún log útil ("container failed to start").
// Así, el proceso siempre arranca y escucha; si @aviva/server falla al
// importarse, el error queda registrado en Cloud Logging y se responde
// 500 en vez de tumbar el contenedor completo.
let appPromise: ReturnType<typeof loadApp> | null = null;
function loadApp() {
  return import('@aviva/server').then((m) => m.app);
}

export const api = onRequest(async (req, res) => {
  try {
    if (!appPromise) appPromise = loadApp();
    const app = await appPromise;
    app(req, res);
  } catch (err) {
    appPromise = null;
    console.error('No se pudo cargar @aviva/server:', err);
    res.status(500).json({ error: 'server_load_failed', message: err instanceof Error ? err.message : String(err) });
  }
});

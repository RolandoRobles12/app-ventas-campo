import { onRequest } from 'firebase-functions/v2/https';

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

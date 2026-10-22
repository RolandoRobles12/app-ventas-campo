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

// 120s: "Generar ruta" consulta el DENUE (hasta 20s por giro) además de
// Firestore; con el default de 60s una zona lenta podía cortarse a medias.
export const api = onRequest({ timeoutSeconds: 120 }, async (req, res) => {
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

// Altas y bajas del equipo de campo desde la base de colaboradores de
// aviva-recruiting (ver _server/equipo.ts), sin que nadie tenga que entrar al
// admin a darle "Sincronizar". Corre media hora después de las dos
// sincronizaciones diarias de aviva-recruiting (12:00 y 19:00) y una vez
// antes de que empiece el día en campo.
export const sincronizarEquipoProgramado = onSchedule(
  { schedule: '30 7,12,19 * * *', timeZone: 'America/Mexico_City', timeoutSeconds: 300 },
  async () => {
    const { isRecruitingConfigured } = await import('./_server/integrations/recruiting.js');
    if (!isRecruitingConfigured()) {
      console.log('Base de colaboradores no configurada (falta RECRUITING_PROJECT_ID) — se omite la sincronización.');
      return;
    }
    const { sincronizarEquipo } = await import('./_server/equipo.js');
    try {
      const r = await sincronizarEquipo({ origen: 'programada' });
      if (r.detenido) console.warn(`Sincronización de equipo detenida: ${r.detenido}`);
      else console.log(`Sincronización de equipo: ${r.altas.length} altas, ${r.bajas.length} bajas, ${r.reactivados.length} reingresos, ${r.actualizados} actualizados.`);
    } catch (err) {
      console.error('Sincronización de equipo (programada) falló:', err);
    }
  },
);

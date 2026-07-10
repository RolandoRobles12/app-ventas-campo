import { onRequest } from 'firebase-functions/v2/https';

// Cloud Functions no tiene disco persistente: las fotos de visitas deben
// guardarse en Firebase Storage en vez de server/uploads.
process.env.STORAGE_DRIVER ??= 'firebase';

const { app } = await import('@aviva/server');

export const api = onRequest(app);

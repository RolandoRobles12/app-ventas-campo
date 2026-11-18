import { createHash } from 'node:crypto';
import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';

// La app del vendedor registra aquí el token de notificaciones de su
// tablet (Firebase Cloud Messaging). Un vendedor puede tener varias tablets
// o navegadores; cada token es un documento (id = hash del token).
export const notificacionesRouter = Router();

export const COLECCION_TOKENS = 'pushTokens';
export const idDeToken = (token: string) => createHash('sha1').update(token).digest('hex');

notificacionesRouter.post('/token', async (req, res) => {
  const { vendedorId, token } = req.body as { vendedorId?: string; token?: string };
  if (!vendedorId || typeof token !== 'string' || token.length < 20 || token.length > 4096) {
    return res.status(400).json({ error: 'TOKEN_INVALIDO', message: 'Token inválido.' });
  }
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);
  await db.collection(COLECCION_TOKENS).doc(idDeToken(token)).set({
    vendedorId, token, actualizadoEn: Timestamp.now(), agente: String(req.headers['user-agent'] || '').slice(0, 200),
  });
  res.status(204).end();
});

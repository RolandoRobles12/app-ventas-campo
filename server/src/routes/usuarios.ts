import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';
import type { UsuarioDoc } from '../auth.js';

// Administra quién tiene acceso al panel de admin (colección `usuarios`, doc
// id = email en minúsculas). No modela el rol "vendedor": esa identidad ya se
// resuelve emparejando por email contra `vendedores` (ver routes/auth.ts).
export const usuariosRouter = Router();

const ALLOWED_EMAIL_DOMAIN = 'avivacredito.com';

function shape(d: UsuarioDoc) {
  return { email: d.email, nombre: d.nombre ?? null, createdAt: toIso(d.createdAt) };
}

usuariosRouter.get('/', async (_req, res) => {
  const snap = await db.collection('usuarios').orderBy('createdAt', 'asc').get();
  res.json(snap.docs.map((d) => shape(d.data() as UsuarioDoc)));
});

usuariosRouter.post('/', async (req, res) => {
  const { email, nombre } = req.body as { email?: string; nombre?: string };
  const normalized = (email || '').trim().toLowerCase();
  if (!normalized.endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
    return res.status(400).json({ error: 'invalid_email', message: `El correo debe ser @${ALLOWED_EMAIL_DOMAIN}` });
  }

  const ref = db.collection('usuarios').doc(normalized);
  if ((await ref.get()).exists) {
    return res.status(409).json({ error: 'already_admin', message: 'Ese correo ya tiene acceso de administrador.' });
  }

  const data: UsuarioDoc = { email: normalized, nombre: nombre?.trim() || null, rol: 'admin', createdAt: Timestamp.now() };
  await ref.set(data);
  res.status(201).json(shape(data));
});

usuariosRouter.delete('/:email', async (req, res) => {
  const normalized = req.params.email.toLowerCase();
  const snap = await db.collection('usuarios').get();
  if (snap.size <= 1) {
    return res.status(400).json({ error: 'last_admin', message: 'No puedes quitar al último administrador — agrega otro primero.' });
  }
  await db.collection('usuarios').doc(normalized).delete();
  res.status(204).end();
});

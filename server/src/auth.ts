import type { NextFunction, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';

const ALLOWED_EMAIL_DOMAIN = 'avivacredito.com';

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });

  try {
    const decoded = await getAuth().verifyIdToken(token);
    if (!decoded.email || !decoded.email_verified || !decoded.email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`)) {
      return res.status(403).json({ error: 'forbidden_domain' });
    }
    req.user = { uid: decoded.uid, email: decoded.email };
    next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

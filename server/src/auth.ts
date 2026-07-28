import type { NextFunction, Request, Response } from 'express';
import { getAuth } from 'firebase-admin/auth';
import { db, Timestamp } from './db.js';

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
  } catch (err: any) {
    console.error('requireAuth: verifyIdToken falló:', err?.message || err);
    return res.status(401).json({ error: 'invalid_token', message: err?.message });
  }
}

export interface UsuarioDoc {
  email: string;
  nombre: string | null;
  rol: 'admin';
  createdAt: Timestamp;
}

export async function isAdminEmail(email: string): Promise<boolean> {
  const doc = await db.collection('usuarios').doc(email.toLowerCase()).get();
  return doc.exists;
}

// Va después de requireAuth en cada ruta que solo debe usar el panel de
// admin (nunca la app del vendedor). A diferencia de requireAuth, esto sí es
// específico por rol: pertenecer al dominio @avivacredito.com ya no basta.
export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (!(await isAdminEmail(req.user!.email))) {
    return res.status(403).json({ error: 'not_admin', message: 'Esta cuenta no tiene acceso al panel administrativo.' });
  }
  next();
}

// La app del vendedor manda `vendedorId` en el body/URL, pero el servidor no
// se fía de eso: una cuenta que no es admin solo puede leer/escribir datos
// del vendedor cuyo email coincide con el de la sesión. Sin esto, cualquier
// cuenta @avivacredito.com podría inyectar visitas/ubicaciones a nombre de
// otro vendedor y los datos de seguimiento dejarían de ser confiables.
export async function puedeActuarComoVendedor(email: string, vendedorId: string): Promise<boolean> {
  const [vendedorDoc, esAdmin] = await Promise.all([
    db.collection('vendedores').doc(vendedorId).get(),
    isAdminEmail(email),
  ]);
  if (esAdmin) return true;
  if (!vendedorDoc.exists) return false;
  const vEmail = (vendedorDoc.data() as { email?: string | null }).email;
  return !!vEmail && vEmail.toLowerCase() === email.toLowerCase();
}

export function vendedorAjeno(res: Response) {
  return res.status(403).json({ error: 'vendedor_ajeno', message: 'No puedes actuar a nombre de otro vendedor.' });
}

// Los correos en INITIAL_ADMIN_EMAILS siempre recuperan acceso de admin al
// arrancar el servidor, aunque alguien los haya quitado por error desde
// "Usuarios" — resuelve el huevo-y-la-gallina del primer alta (nadie puede
// crear el primer admin desde una UI a la que solo entran admins) y evita
// quedarse sin ningún admin. Solo crea el doc si no existe: no pisa nombre u
// otros campos que un admin real haya editado después.
export async function bootstrapInitialAdmins(): Promise<void> {
  const emails = (process.env.INITIAL_ADMIN_EMAILS || '').split(',').map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) return;
  await Promise.all(emails.map(async (email) => {
    try {
      const ref = db.collection('usuarios').doc(email);
      if (!(await ref.get()).exists) {
        await ref.set({ email, nombre: null, rol: 'admin', createdAt: Timestamp.now() });
      }
    } catch (err: any) {
      console.error(`bootstrapInitialAdmins: no se pudo asegurar admin "${email}":`, err?.message || err);
    }
  }));
}

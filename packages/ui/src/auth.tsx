import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, googleProvider, ALLOWED_EMAIL_DOMAIN } from './firebase';

interface AuthState {
  user: User | null;
  loading: boolean;
  error: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

function isAllowedEmail(email: string | null | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${ALLOWED_EMAIL_DOMAIN}`);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u && isAllowedEmail(u.email) ? u : null);
    setLoading(false);
  }), []);

  const signInWithGoogle = async () => {
    setError(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      if (!isAllowedEmail(result.user.email)) {
        await signOut(auth);
        setUser(null);
        setError(`Solo cuentas @${ALLOWED_EMAIL_DOMAIN} pueden entrar.`);
        return;
      }
      setUser(result.user);
    } catch {
      setError('No se pudo iniciar sesión. Intenta de nuevo.');
    }
  };

  const signOutUser = async () => {
    await signOut(auth);
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, signInWithGoogle, signOutUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider');
  return ctx;
}

export async function getIdToken(): Promise<string | null> {
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, error, signInWithGoogle } = useAuth();

  if (loading) return null;

  if (!user) {
    return (
      <div style={{
        minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(180deg,#cfe8dc 0%,#dcefe5 34%,#e9f4ee 100%)', padding: 24,
      }}>
        <div style={{
          background: '#fff', borderRadius: 20, padding: '36px 30px', maxWidth: 360, width: '100%',
          boxShadow: '0 10px 30px rgba(20,60,40,.12)', textAlign: 'center',
        }}>
          <h1 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--ink-900)' }}>Aviva — Visitas de Campo</h1>
          <p style={{ margin: '0 0 24px', fontSize: 14, color: 'var(--ink-300)', fontWeight: 500, lineHeight: 1.5 }}>
            Inicia sesión con tu cuenta de {ALLOWED_EMAIL_DOMAIN}.
          </p>
          <button
            onClick={signInWithGoogle}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, width: '100%',
              background: 'var(--aviva-green-700, #0f5132)', color: '#fff', border: 'none', borderRadius: 12,
              padding: '13px 16px', fontSize: 14.5, fontWeight: 700, cursor: 'pointer',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="#fff" d="M21.35 11.1h-9.17v2.92h5.27c-.23 1.5-1.66 4.39-5.27 4.39-3.17 0-5.76-2.62-5.76-5.86s2.59-5.86 5.76-5.86c1.81 0 3.02.77 3.71 1.44l2.53-2.44C16.94 3.99 14.9 3 12.18 3 6.9 3 2.6 7.28 2.6 12.55S6.9 22.1 12.18 22.1c6.03 0 9.35-4.24 9.35-10.2 0-.68-.08-1.2-.18-1.8Z"/></svg>
            Iniciar sesión con Google
          </button>
          {error && <p style={{ margin: '16px 0 0', fontSize: 13, color: 'var(--aviva-red-600, #d64545)', fontWeight: 600 }}>{error}</p>}
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@aviva/ui';
import { api } from './api';

interface SessionState {
  isAdmin: boolean;
  loading: boolean;
  email: string | null;
  salir: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, signOutUser } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.me()
      .then((r) => setIsAdmin(r.isAdmin))
      .catch(() => setIsAdmin(false))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <SessionContext.Provider value={{ isAdmin, loading, email: user?.email ?? null, salir: signOutUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}

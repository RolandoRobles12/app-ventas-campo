import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@aviva/ui';
import { api, type Vendedor } from './api';

interface SessionState {
  vendedor: Vendedor | null;
  loading: boolean;
  email: string | null;
  salir: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, signOutUser } = useAuth();
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.me()
      .then((r) => setVendedor(r.vendedor))
      .catch(() => setVendedor(null))
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <SessionContext.Provider value={{ vendedor, loading, email: user?.email ?? null, salir: signOutUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}

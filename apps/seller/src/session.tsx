import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@aviva/ui';
import { api, type Vendedor } from './api';

interface SessionState {
  vendedor: Vendedor | null;
  // La cuenta sí era de un vendedor, pero está dado de baja en la base de
  // colaboradores (aviva-recruiting).
  baja: boolean;
  loading: boolean;
  email: string | null;
  salir: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

const CACHE_KEY = 'aviva.sesionVendedor';

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user, signOutUser } = useAuth();
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [baja, setBaja] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    api.me()
      .then((r) => {
        setVendedor(r.vendedor);
        setBaja(r.baja);
        try {
          if (r.vendedor) localStorage.setItem(CACHE_KEY, JSON.stringify({ email: user?.email, vendedor: r.vendedor }));
          else localStorage.removeItem(CACHE_KEY);
        } catch { /* sin espacio: solo se pierde el respaldo offline */ }
      })
      .catch(() => {
        // Sin señal al abrir la app: se usa el último vendedor conocido de
        // esta misma cuenta para poder trabajar con la ruta guardada.
        try {
          const guardado = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null') as { email?: string; vendedor: Vendedor } | null;
          setVendedor(guardado && guardado.email === user?.email ? guardado.vendedor : null);
        } catch {
          setVendedor(null);
        }
      })
      .finally(() => setLoading(false));
  }, [user]);

  return (
    <SessionContext.Provider value={{ vendedor, baja, loading, email: user?.email ?? null, salir: signOutUser }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}

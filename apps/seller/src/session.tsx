import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type Vendedor } from './api';

interface SessionState {
  vendedor: Vendedor | null;
  loading: boolean;
  vendedores: Vendedor[];
  elegir: (v: Vendedor) => void;
  salir: () => void;
}

const SessionContext = createContext<SessionState | null>(null);

const STORAGE_KEY = 'aviva.vendedorId';

export function SessionProvider({ children }: { children: ReactNode }) {
  const [vendedores, setVendedores] = useState<Vendedor[]>([]);
  const [vendedor, setVendedor] = useState<Vendedor | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.vendedoresDeCampo().then((vs) => {
      setVendedores(vs);
      const savedId = localStorage.getItem(STORAGE_KEY);
      const saved = savedId ? vs.find((v) => v.id === savedId) : null;
      setVendedor(saved || null);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  const elegir = (v: Vendedor) => {
    localStorage.setItem(STORAGE_KEY, v.id);
    setVendedor(v);
  };
  const salir = () => {
    localStorage.removeItem(STORAGE_KEY);
    setVendedor(null);
  };

  return (
    <SessionContext.Provider value={{ vendedor, loading, vendedores, elegir, salir }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession debe usarse dentro de SessionProvider');
  return ctx;
}

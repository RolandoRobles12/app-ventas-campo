import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type JornadaHoy } from './api';

interface JornadaState {
  jornada: JornadaHoy | null;
  busy: boolean;
  toggle: () => Promise<void>;
  reload: () => void;
}

const JornadaContext = createContext<JornadaState | null>(null);

// Vive por encima de las rutas (ver App.tsx) para que tanto la pantalla de
// Jornada como el rastreo de ubicación en segundo plano (LocationTracker)
// sepan si la jornada está activa sin depender de en qué pantalla esté el
// vendedor en ese momento.
export function JornadaProvider({ vendedorId, children }: { vendedorId: string; children: ReactNode }) {
  const [jornada, setJornada] = useState<JornadaHoy | null>(null);
  const [busy, setBusy] = useState(false);

  const reload = () => { api.jornadaHoy(vendedorId).then(setJornada).catch(() => {}); };
  useEffect(reload, [vendedorId]);

  const toggle = async () => {
    setBusy(true);
    try {
      const updated = await api.toggleJornada(vendedorId);
      setJornada(updated);
    } finally {
      setBusy(false);
    }
  };

  return <JornadaContext.Provider value={{ jornada, busy, toggle, reload }}>{children}</JornadaContext.Provider>;
}

export function useJornada(): JornadaState {
  const ctx = useContext(JornadaContext);
  if (!ctx) throw new Error('useJornada debe usarse dentro de JornadaProvider');
  return ctx;
}

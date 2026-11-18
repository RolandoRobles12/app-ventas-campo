import { useEffect, useState } from 'react';
import { api } from './api';

// Ajustes que el admin cambia desde el panel (hoy, la distancia máxima al
// negocio para registrar una visita). Se guardan en la tablet para que el
// cerco funcione sin señal; el servidor aplica la misma regla.

export interface ConfigApp { radioCercoMetros: number }

const LLAVE = 'aviva.configApp';
const POR_DEFECTO: ConfigApp = { radioCercoMetros: 150 };

function enCache(): ConfigApp {
  try {
    return { ...POR_DEFECTO, ...(JSON.parse(localStorage.getItem(LLAVE) || 'null') ?? {}) };
  } catch {
    return POR_DEFECTO;
  }
}

export function useConfigApp(): ConfigApp {
  const [config, setConfig] = useState<ConfigApp>(enCache);
  useEffect(() => {
    api.config().then((c) => {
      try { localStorage.setItem(LLAVE, JSON.stringify(c)); } catch { /* sin espacio: queda la copia anterior */ }
      setConfig({ ...POR_DEFECTO, ...c });
    }).catch(() => {});
  }, []);
  return config;
}

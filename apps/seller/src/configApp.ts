import { useEffect, useState } from 'react';
import { api } from './api';

// Ajustes que el admin cambia desde el panel (la distancia máxima al
// negocio para registrar una visita y qué % de sesiones se graban). Se
// guardan en la tablet para que el cerco funcione sin señal; el servidor
// aplica la misma regla.

export interface ConfigApp { radioCercoMetros: number; grabacionPorcentaje: number }

const LLAVE = 'aviva.configApp';
const POR_DEFECTO: ConfigApp = { radioCercoMetros: 150, grabacionPorcentaje: 0 };

export function enCache(): ConfigApp {
  try {
    return { ...POR_DEFECTO, ...(JSON.parse(localStorage.getItem(LLAVE) || 'null') ?? {}) };
  } catch {
    return POR_DEFECTO;
  }
}

export function useConfigApp(): ConfigApp {
  const [config, setConfig] = useState<ConfigApp>(enCache);
  useEffect(() => {
    cargarConfig().then((c) => { if (c) setConfig(c); });
  }, []);
  return config;
}

// La config del servidor (y la guarda en la tablet); null sin señal.
export async function cargarConfig(): Promise<ConfigApp | null> {
  try {
    const c = await api.config();
    try { localStorage.setItem(LLAVE, JSON.stringify(c)); } catch { /* sin espacio: queda la copia anterior */ }
    return { ...POR_DEFECTO, ...c };
  } catch {
    return null;
  }
}

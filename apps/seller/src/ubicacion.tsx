import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, ApiError } from './api';
import { guardarPingPendiente } from './offline';
import type { Posicion } from './ruta';

// Una sola fuente de ubicación para toda la app: ordena la ruta por cercanía
// ("la más cercana primero") y manda el punto del recorrido al servidor cada
// 5 minutos para el seguimiento en vivo del admin. Antes eran dos lecturas
// de GPS separadas; en una tablet de gama baja cada lectura cuesta batería.

const REFRESCO_MS = 60 * 1000;
const PING_MS = 5 * 60 * 1000;

// Un fix de red (sin GPS real) puede traer precisión de kilómetros y ensucia
// el recorrido con picos falsos: se usa para ordenar la lista, pero no se
// manda como punto del recorrido.
const MAX_ACCURACY_PING_M = 250;

interface UbicacionState {
  posicion: Posicion | null;
  refrescar: () => void;
}

const UbicacionContext = createContext<UbicacionState>({ posicion: null, refrescar: () => {} });

// Es "mejor esfuerzo": en un navegador (no una app nativa) no hay forma de
// garantizar que siga corriendo con la pantalla apagada o la pestaña en
// segundo plano. Para no dejar huecos grandes, al volver a primer plano se
// pide una lectura nueva enseguida. Si un punto no se puede enviar por falta
// de señal, se guarda con su hora de captura y se reenvía después (offline.ts).
export function UbicacionProvider({ vendedorId, children }: { vendedorId: string; children: ReactNode }) {
  const [posicion, setPosicion] = useState<Posicion | null>(null);
  const ultimoPing = useRef(0);
  const ultimaLectura = useRef(0);

  const enviarPing = useCallback((p: Posicion) => {
    if (p.accuracy > MAX_ACCURACY_PING_M || Date.now() - ultimoPing.current < PING_MS - 30_000) return;
    ultimoPing.current = Date.now();
    const punto = { vendedorId, lat: p.lat, lng: p.lng, accuracy: Math.round(p.accuracy), capturadoEn: Date.now() };
    api.registrarUbicacion(punto).catch((err) => {
      // ApiError = el servidor lo rechazó (reenviar no ayuda); todo lo
      // demás es falta de red: se guarda y se reenvía al volver la señal.
      if (!(err instanceof ApiError)) guardarPingPendiente(punto);
    });
  }, [vendedorId]);

  const refrescar = useCallback(() => {
    if (!('geolocation' in navigator)) return;
    ultimaLectura.current = Date.now();
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const p = { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
        setPosicion(p);
        enviarPing(p);
      },
      () => {}, // sin señal GPS: se reintenta en el siguiente ciclo
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 45000 },
    );
  }, [enviarPing]);

  useEffect(() => {
    refrescar();
    // Con la app en segundo plano (si el sistema deja correr el timer) ya no
    // hace falta reordenar la lista: solo se lee para el punto del recorrido.
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible' || Date.now() - ultimoPing.current >= PING_MS - 30_000) refrescar();
    }, REFRESCO_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - ultimaLectura.current > 30_000) refrescar();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refrescar]);

  return <UbicacionContext.Provider value={{ posicion, refrescar }}>{children}</UbicacionContext.Provider>;
}

export function useUbicacion(): UbicacionState {
  return useContext(UbicacionContext);
}

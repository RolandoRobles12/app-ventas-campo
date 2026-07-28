import { useEffect, useRef } from 'react';
import { api, ApiError } from '../api';
import { guardarPingPendiente } from '../offline';
import { useSession } from '../session';

const INTERVALO_MS = 5 * 60 * 1000;

// Un fix de red (sin GPS real) puede traer precisión de kilómetros y ensucia
// el recorrido con picos falsos; mejor saltarse ese ciclo y esperar el siguiente.
const MAX_ACCURACY_M = 250;

// No renderiza nada — corre mientras la app esté abierta y haya un vendedor
// con sesión (ya no depende de "iniciar jornada" a mano), mandando un punto
// GPS cada 5 minutos para armar el recorrido del día y que Seguimiento/Mapa
// de calor en el admin tengan datos reales. Es "mejor esfuerzo": en un
// navegador (no una app nativa) no hay forma de garantizar que siga
// corriendo con la pantalla apagada o la pestaña en segundo plano (esa es
// una restricción del sistema operativo, no de este código; en Android
// Chrome el timer puede seguir corriendo un rato en segundo plano, pero no
// está garantizado). Para no dejar huecos grandes, en cuanto la pestaña
// vuelve a primer plano se manda un punto de recuperación si ya casi le
// tocaba al siguiente ciclo. Si un punto no se puede enviar por falta de
// señal, se guarda localmente con su hora de captura y se reenvía después
// (ver offline.ts), así el recorrido no queda con huecos por mala cobertura.
export function LocationTracker() {
  const { vendedor } = useSession();
  const lastPingRef = useRef(0);

  useEffect(() => {
    if (!vendedor || !('geolocation' in navigator)) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const ping = () => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          if (cancelled) return;
          lastPingRef.current = Date.now();
          if (pos.coords.accuracy > MAX_ACCURACY_M) return;
          const punto = {
            vendedorId: vendedor.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
            capturadoEn: Date.now(),
          };
          api.registrarUbicacion(punto).catch((err) => {
            // ApiError = el servidor lo rechazó (reenviar no ayuda); todo lo
            // demás es falta de red: se guarda y se reenvía al volver la señal.
            if (!(err instanceof ApiError)) guardarPingPendiente(punto);
          });
        },
        () => {}, // sin permiso o sin señal GPS: se reintenta en el siguiente ciclo
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 },
      );
    };

    const schedule = () => {
      timer = setTimeout(() => {
        if (cancelled) return;
        ping();
        schedule();
      }, INTERVALO_MS);
    };

    ping(); // punto inmediato al abrir la app, sin esperar el primer ciclo
    schedule();

    const onVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      if (Date.now() - lastPingRef.current >= INTERVALO_MS - 30000) ping();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [vendedor]);

  return null;
}

import { useEffect, useRef } from 'react';
import { api } from '../api';
import { useSession } from '../session';

const INTERVALO_MS = 5 * 60 * 1000;

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
// tocaba al siguiente ciclo.
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
          api.registrarUbicacion({
            vendedorId: vendedor.id,
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: Math.round(pos.coords.accuracy),
          }).catch(() => {});
        },
        () => {}, // sin permiso o sin señal: se reintenta en el siguiente ciclo
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

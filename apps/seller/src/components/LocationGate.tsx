import { useCallback, useEffect, useState } from 'react';
import type { ReactNode } from 'react';

type Estado =
  | { status: 'verificando' }
  | { status: 'ok' }
  | { status: 'bloqueado'; titulo: string; detalle: string };

// La ubicación es obligatoria para usar la app: sin un fix de GPS no hay
// validación de visitas ni recorrido, así que si el permiso está denegado o
// la ubicación del teléfono está apagada, se bloquea todo (no solo el
// tracking) hasta que el vendedor la active. También reacciona en vivo si el
// permiso se revoca con la app abierta (Permissions API).
export function LocationGate({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<Estado>({ status: 'verificando' });

  const verificar = useCallback(() => {
    if (!('geolocation' in navigator)) {
      setEstado({
        status: 'bloqueado',
        titulo: 'Sin ubicación disponible',
        detalle: 'Este dispositivo o navegador no permite acceder a la ubicación, y la aplicación la necesita para registrar visitas.',
      });
      return;
    }
    setEstado({ status: 'verificando' });
    navigator.geolocation.getCurrentPosition(
      () => setEstado({ status: 'ok' }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          setEstado({
            status: 'bloqueado',
            titulo: 'Activa tu ubicación',
            detalle: 'El permiso de ubicación está bloqueado para esta aplicación. Ábrelo en la configuración del navegador (Permisos → Ubicación → Permitir) y toca Reintentar.',
          });
        } else {
          setEstado({
            status: 'bloqueado',
            titulo: 'No encontramos tu ubicación',
            detalle: 'Revisa que la ubicación (GPS) de tu teléfono esté encendida y toca Reintentar.',
          });
        }
      },
      // Para abrir la app basta un fix rápido y burdo (red/wifi); la precisión
      // fina la afina el formulario de visita con watchPosition.
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 60000 },
    );
  }, []);

  useEffect(() => {
    verificar();
    let permiso: PermissionStatus | null = null;
    let cancelado = false;
    navigator.permissions?.query({ name: 'geolocation' })
      .then((s) => {
        if (cancelado) return;
        permiso = s;
        s.onchange = () => verificar();
      })
      .catch(() => {});
    return () => {
      cancelado = true;
      if (permiso) permiso.onchange = null;
    };
  }, [verificar]);

  if (estado.status === 'ok') return <>{children}</>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 28px', textAlign: 'center' }}>
      <div style={{
        width: 88, height: 88, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: estado.status === 'verificando' ? 'var(--aviva-green-100)' : 'var(--aviva-orange-100)',
      }}>
        <svg width="42" height="42" viewBox="0 0 24 24" fill="none" stroke={estado.status === 'verificando' ? '#15915c' : '#e07a26'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
      </div>

      {estado.status === 'verificando' ? (
        <h2 style={{ margin: '22px 0 0', fontSize: 20, fontWeight: 800, color: 'var(--ink-900)' }}>Verificando tu ubicación…</h2>
      ) : (
        <>
          <h2 style={{ margin: '22px 0 0', fontSize: 22, fontWeight: 800, color: 'var(--ink-900)' }}>{estado.titulo}</h2>
          <p style={{ margin: '10px 0 0', fontSize: 14, fontWeight: 500, color: 'var(--ink-300)', lineHeight: 1.55, maxWidth: 300 }}>
            {estado.detalle}
          </p>
          <button
            onClick={verificar}
            style={{
              marginTop: 24, width: '100%', maxWidth: 300, border: 'none', background: 'var(--aviva-green-700)',
              color: '#fff', fontSize: 15, fontWeight: 700, padding: 15, borderRadius: 16,
              boxShadow: '0 10px 24px rgba(15,81,50,.3)',
            }}
          >
            Reintentar
          </button>
        </>
      )}
    </div>
  );
}

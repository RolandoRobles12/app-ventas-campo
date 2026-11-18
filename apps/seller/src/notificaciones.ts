import { useEffect, useState } from 'react';
import { firebaseApp } from '@aviva/ui';
import { api } from './api';

// Avisos de citas en la tablet (notificaciones push con Firebase Cloud
// Messaging). El servidor los manda (server/src/recordatorios.ts) y el
// service worker de la app (public/sw.js) los muestra, tanto en la app
// instalada como en el navegador.
//
// Necesita la clave pública de "Certificados de push web" de Firebase en
// VITE_FIREBASE_VAPID_KEY (apps/seller/.env) y el service worker, que solo se
// registra en el build de producción.

const VAPID = import.meta.env.VITE_FIREBASE_VAPID_KEY as string | undefined;
const LLAVE_POSPUESTO = 'aviva.avisosPospuestos';
const POSPONER_MS = 7 * 86_400_000;

export type EstadoAvisos = 'no_soportado' | 'default' | 'granted' | 'denied';

function soportado(): boolean {
  return !!VAPID && (import.meta.env.PROD || import.meta.env.VITE_AVISOS_EN_DEV === '1')
    && 'Notification' in window && 'serviceWorker' in navigator && 'PushManager' in window;
}

async function registrarTablet(vendedorId: string): Promise<void> {
  const { getMessaging, getToken, isSupported } = await import('firebase/messaging');
  if (!(await isSupported())) return;
  const reg = await navigator.serviceWorker.ready;
  const token = await getToken(getMessaging(firebaseApp), { vapidKey: VAPID, serviceWorkerRegistration: reg });
  if (token) await api.registrarTokenPush(vendedorId, token);
}

const pospuesto = () => {
  try { return Date.now() - Number(localStorage.getItem(LLAVE_POSPUESTO) || 0) < POSPONER_MS; } catch { return false; }
};

export function useAvisos(vendedorId: string | undefined) {
  const [estado, setEstado] = useState<EstadoAvisos>(() => (soportado() ? Notification.permission : 'no_soportado'));
  const [oculto, setOculto] = useState(pospuesto);

  // Con permiso ya dado, se vuelve a registrar al abrir la app: el token de
  // una tablet puede cambiar y el servidor borra los que ya no sirven.
  useEffect(() => {
    if (vendedorId && estado === 'granted') registrarTablet(vendedorId).catch(() => {});
  }, [vendedorId, estado]);

  const activar = async () => {
    if (!vendedorId || !soportado()) return;
    const permiso = await Notification.requestPermission();
    setEstado(permiso);
  };
  const posponer = () => {
    try { localStorage.setItem(LLAVE_POSPUESTO, String(Date.now())); } catch { /* sin espacio */ }
    setOculto(true);
  };

  return { estado, activar, posponer, mostrarInvitacion: estado === 'default' && !oculto };
}

// Carga el script de la API de Google Maps una sola vez para toda la app
// (aunque haya varios mapas montados a la vez: GeoMap, el picker de GPS, el
// dibujo de zona): todos comparten la misma promesa y las mismas librerías,
// porque cargar el script dos veces con distintos `libraries` no funciona.
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loaderPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google);
    if (!GOOGLE_MAPS_API_KEY) return reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY'));
    // No se pide "drawing": DrawingManager está deprecado y removido de la API
    // en v3.65+ (ver LocationPickerMap.tsx), así que el path del polígono se
    // arma a mano con clics — pedir esa librería inexistente puede romper la
    // carga del script para todo lo demás.
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=visualization,places&v=weekly`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

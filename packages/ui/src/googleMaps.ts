// Carga el script de la API de Google Maps una sola vez por app (aunque haya
// varios mapas montados a la vez): todos comparten la misma promesa y las
// mismas librerías, porque cargar el script dos veces con distintos
// `libraries` no funciona. Cada app (admin, seller) trae su propia
// VITE_GOOGLE_MAPS_API_KEY vía su propio .env — Vite reemplaza
// import.meta.env en tiempo de build de cada app, aunque el código viva aquí.
export const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string | undefined;

let loaderPromise: Promise<typeof google> | null = null;

export function loadGoogleMaps(): Promise<typeof google> {
  if (loaderPromise) return loaderPromise;
  loaderPromise = new Promise((resolve, reject) => {
    if (window.google?.maps) return resolve(window.google);
    if (!GOOGLE_MAPS_API_KEY) return reject(new Error('Falta VITE_GOOGLE_MAPS_API_KEY'));
    // No se piden "drawing" ni "visualization": DrawingManager y HeatmapLayer
    // están deprecados y removidos de la API en v3.65+ (ver LocationPickerMap.tsx
    // y GeoMap.tsx en apps/admin), así que el path del polígono y el heatmap
    // se arman a mano — pedir librerías inexistentes puede romper la carga
    // del script para todo lo demás.
    const script = document.createElement('script');
    script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&v=weekly`;
    script.async = true;
    script.onload = () => resolve(window.google);
    script.onerror = () => reject(new Error('No se pudo cargar Google Maps'));
    document.head.appendChild(script);
  });
  return loaderPromise;
}

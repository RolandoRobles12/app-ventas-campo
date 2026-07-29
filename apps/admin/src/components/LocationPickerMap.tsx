import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@aviva/ui';

const DEFAULT_CENTER = { lat: 20.6597, lng: -103.3496 };

export interface LatLng { lat: number; lng: number }

// Un solo punto: clic o arrastre del marcador lo mueve. `recenterToken` es un
// valor que el padre cambia (p. ej. un contador) cuando quiere forzar que el
// mapa/marcador salten a un punto externo (ej. "usar mi ubicación actual")
// sin pelear con los clics del usuario en cada render.
export function MarkerPickerMap({
  lat, lng, onPick, radioMetros, recenterToken, height,
}: {
  lat: number | null; lng: number | null; onPick: (p: LatLng) => void;
  radioMetros?: number; recenterToken?: number; height: number | string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const circleRef = useRef<google.maps.Circle | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const center = lat != null && lng != null ? { lat, lng } : DEFAULT_CENTER;
      const map = new g.maps.Map(containerRef.current, { center, zoom: lat != null ? 15 : 12, streetViewControl: false, mapTypeControl: false, fullscreenControl: false });
      mapRef.current = map;

      const setPosition = (p: LatLng) => {
        if (!markerRef.current) {
          markerRef.current = new g.maps.Marker({ position: p, map, draggable: true });
          markerRef.current.addListener('dragend', () => {
            const pos = markerRef.current!.getPosition()!;
            onPick({ lat: pos.lat(), lng: pos.lng() });
          });
        } else {
          markerRef.current.setPosition(p);
        }
        if (circleRef.current) circleRef.current.setCenter(p);
      };

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const p = { lat: e.latLng.lat(), lng: e.latLng.lng() };
        setPosition(p);
        onPick(p);
      });

      if (lat != null && lng != null) setPosition({ lat, lng });
      // (setPosition se define de nuevo cada montaje del mapa; queda cerrada
      // sobre map/markerRef/circleRef vigentes, no hace falta guardarla fuera.)
    }).catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reposiciona solo cuando el padre pide explícitamente un recentrado
  // (ej. geolocalización), no en cada render.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || lat == null || lng == null) return;
    const p = { lat, lng };
    map.panTo(p);
    map.setZoom(15);
    if (!markerRef.current) {
      markerRef.current = new google.maps.Marker({ position: p, map, draggable: true });
      markerRef.current.addListener('dragend', () => {
        const pos = markerRef.current!.getPosition()!;
        onPick({ lat: pos.lat(), lng: pos.lng() });
      });
    } else {
      markerRef.current.setPosition(p);
    }
    if (circleRef.current) circleRef.current.setCenter(p);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recenterToken]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (circleRef.current) { circleRef.current.setMap(null); circleRef.current = null; }
    if (!radioMetros || lat == null || lng == null) return;
    circleRef.current = new google.maps.Circle({
      center: { lat, lng }, radius: radioMetros, map,
      fillColor: '#157347', fillOpacity: 0.12, strokeColor: '#0f5132', strokeWeight: 1.5,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [radioMetros]);

  if (error) return <MapError height={height} message={error} />;
  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}

export const ZONA_COLORS = ['#0f5132', '#1d5fae', '#a3471d', '#7b1da3', '#a31d5f', '#1d8fa3'];

// Dibuja una o varias zonas (polígonos) a mano clic a clic —
// google.maps.drawing.DrawingManager ya no existe en la API (deprecado y
// removido en la v3.65+), así que se arma cada path directamente con clics
// sobre el mapa. `zones` es un arreglo de contornos; los clics del mapa
// agregan puntos únicamente a `zones[activeZoneIndex]` (la zona "activa"),
// pero todas las zonas quedan visibles y editables (arrastrar sus vértices)
// al mismo tiempo.
export function PolygonDrawMap({
  zones, activeZoneIndex, onChange, height,
}: {
  zones: LatLng[][]; activeZoneIndex: number; onChange: (zones: LatLng[][]) => void; height: number | string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonsRef = useRef<google.maps.Polygon[]>([]);
  const zonesRef = useRef<LatLng[][]>(zones);
  const activeIndexRef = useRef(activeZoneIndex);
  const onChangeRef = useRef(onChange);
  const syncZonesRef = useRef<() => void>(() => {});
  const [error, setError] = useState('');

  zonesRef.current = zones;
  activeIndexRef.current = activeZoneIndex;
  onChangeRef.current = onChange;

  // Crea/destruye overlays de google.maps.Polygon para que coincidan con
  // zonesRef.current, y corrige el path de las zonas que cambiaron por
  // fuera del propio dibujo (ej. "Limpiar", o quitar una zona de en medio
  // corre a las siguientes a su nuevo índice). Solo lee de refs, nunca de
  // `zones`/`onChange` directamente, para poder llamarse tanto desde el
  // efecto de montaje (una vez el mapa cargó, de forma asíncrona) como del
  // efecto que reacciona a cambios de `zones` — cualquiera que dispare
  // primero dejará el mapa sincronizado.
  syncZonesRef.current = () => {
    const map = mapRef.current;
    if (!map) return;
    const zonas = zonesRef.current;

    while (polygonsRef.current.length > zonas.length) {
      polygonsRef.current.pop()!.setMap(null);
    }
    while (polygonsRef.current.length < zonas.length) {
      const idx = polygonsRef.current.length;
      const color = ZONA_COLORS[idx % ZONA_COLORS.length];
      // Sin `paths` en el constructor: así el Polygon arranca con un MVCArray
      // vacío pero válido (patrón recomendado por Google para dibujar a
      // clics). Pasar `paths: []` explícito es el patrón que se rompía.
      const polygon = new google.maps.Polygon({ map, editable: true, fillColor: color, fillOpacity: 0.15, strokeColor: color, strokeWeight: 2.5 });
      const syncFromPolygon = () => {
        const path = polygon.getPath();
        const pts: LatLng[] = [];
        for (let i = 0; i < path.getLength(); i++) {
          const p = path.getAt(i);
          pts.push({ lat: p.lat(), lng: p.lng() });
        }
        const next = zonesRef.current.slice();
        next[idx] = pts;
        onChangeRef.current(next);
      };
      const path = polygon.getPath();
      path.addListener('set_at', syncFromPolygon);
      path.addListener('insert_at', syncFromPolygon);
      path.addListener('remove_at', syncFromPolygon);
      polygonsRef.current.push(polygon);
    }
    polygonsRef.current.forEach((polygon, idx) => {
      const target = zonas[idx] || [];
      const path = polygon.getPath();
      const actual: LatLng[] = [];
      for (let i = 0; i < path.getLength(); i++) {
        const p = path.getAt(i);
        actual.push({ lat: p.lat(), lng: p.lng() });
      }
      // Comparación por contenido (no solo longitud): al quitar una zona que
      // no es la última, los overlays restantes deben "correrse" a los
      // puntos de la zona que ahora ocupa su índice, aunque tengan el mismo
      // número de puntos que los que ya traían.
      if (JSON.stringify(actual) !== JSON.stringify(target)) polygon.setPath(target);
    });
  };

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const center = zonesRef.current.flat()[0] || DEFAULT_CENTER;
      const map = new g.maps.Map(containerRef.current, { center, zoom: 13, streetViewControl: false, mapTypeControl: false, fullscreenControl: false });
      mapRef.current = map;

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        const activePolygon = polygonsRef.current[activeIndexRef.current];
        if (activePolygon) activePolygon.getPath().push(e.latLng);
      });

      // El mapa carga de forma asíncrona (loadGoogleMaps): si `zones` no
      // vuelve a cambiar después de este punto, este es el único momento en
      // que se crean los overlays iniciales.
      syncZonesRef.current();
    }).catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    syncZonesRef.current();
  }, [zones]);

  if (error) return <MapError height={height} message={error} />;
  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}

function MapError({ height, message }: { height: number | string; message: string }) {
  return (
    <div style={{ height, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f2f5f2', borderRadius: 10, color: '#8a978f', fontSize: 13, textAlign: 'center', padding: 16 }}>
      No se pudo cargar Google Maps: {message}
    </div>
  );
}

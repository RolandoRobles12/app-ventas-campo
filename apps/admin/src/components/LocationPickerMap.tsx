import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../lib/googleMaps';

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
      const map = new g.maps.Map(containerRef.current, { center, zoom: lat != null ? 15 : 12, streetViewControl: false, mapTypeControl: false });
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

// Dibuja un polígono a mano clic a clic — google.maps.drawing.DrawingManager
// ya no existe en la API (deprecado y removido en la v3.65+), así que se
// arma el path directamente con clics sobre el mapa.
export function PolygonDrawMap({
  points, onChange, height,
}: {
  points: LatLng[]; onChange: (points: LatLng[]) => void; height: number | string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const polygonRef = useRef<google.maps.Polygon | null>(null);
  const pointsRef = useRef<LatLng[]>(points);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps().then((g) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      const center = pointsRef.current[0] || DEFAULT_CENTER;
      const map = new g.maps.Map(containerRef.current, { center, zoom: 13, streetViewControl: false, mapTypeControl: false });
      mapRef.current = map;
      // Sin `paths` en el constructor: así el Polygon arranca con un MVCArray
      // vacío pero válido (patrón recomendado por Google para dibujar a
      // clics). Pasar `paths: []` explícito es el patrón que se rompía.
      polygonRef.current = new g.maps.Polygon({
        map, editable: true,
        fillColor: '#157347', fillOpacity: 0.15, strokeColor: '#0f5132', strokeWeight: 2.5,
      });
      if (pointsRef.current.length) polygonRef.current.setPath(pointsRef.current);

      const syncFromPolygon = () => {
        const path = polygonRef.current!.getPath();
        const pts: LatLng[] = [];
        for (let i = 0; i < path.getLength(); i++) {
          const p = path.getAt(i);
          pts.push({ lat: p.lat(), lng: p.lng() });
        }
        pointsRef.current = pts;
        onChange(pts);
      };
      const path = polygonRef.current.getPath();
      path.addListener('set_at', syncFromPolygon);
      path.addListener('insert_at', syncFromPolygon);
      path.addListener('remove_at', syncFromPolygon);

      map.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        polygonRef.current!.getPath().push(e.latLng);
      });
    }).catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

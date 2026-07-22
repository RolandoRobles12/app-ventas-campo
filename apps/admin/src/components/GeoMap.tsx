import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../lib/googleMaps';

export interface HeatPoint { lat: number; lng: number; peso: number }
export interface MapPin { id: string; lat: number; lng: number; color: string; title: string; subtitle?: string }

// Centro de la zona metropolitana de Guadalajara mientras no hay puntos que encuadrar.
const DEFAULT_CENTER = { lat: 20.6597, lng: -103.3496 };

// Misma rampa secuencial YlOrRd (ColorBrewer) que se usaba con Leaflet.heat,
// pero como arreglo ordenado: así es como Google Maps espera un `gradient`.
const HEAT_GRADIENT = [
  'rgba(255,255,178,0)', '#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026',
];

// @types/google.maps ya no modela la Visualization Library heredada (Google
// la da por legacy en favor de overlays más nuevos), pero la API real en
// runtime sigue funcionando igual — se declara aquí el pedazo que usamos en
// vez de confiar en el stub casi vacío que trae el paquete de tipos.
interface HeatmapLayerLike {
  setMap(map: google.maps.Map | null): void;
}
type HeatmapLayerCtor = new (opts: {
  data: { location: google.maps.LatLng; weight: number }[];
  radius?: number;
  opacity?: number;
  gradient?: string[];
}) => HeatmapLayerLike;

function pinIconUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1.6"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#fff" stroke="none"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function GeoMap({ heatPoints, pins, height }: { heatPoints?: HeatPoint[]; pins?: MapPin[]; height: number | string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const heatRef = useRef<HeatmapLayerLike | null>(null);
  const markersRef = useRef<google.maps.Marker[]>([]);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then((g) => {
        if (cancelled || !containerRef.current || mapRef.current) return;
        mapRef.current = new g.maps.Map(containerRef.current, {
          center: DEFAULT_CENTER, zoom: 12, streetViewControl: false, mapTypeControl: false,
        });
        infoWindowRef.current = new g.maps.InfoWindow();
        setReady(true);
      })
      .catch((err) => !cancelled && setError(err.message));
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (heatRef.current) { heatRef.current.setMap(null); heatRef.current = null; }
    if (!heatPoints?.length) return;
    const maxPeso = Math.max(...heatPoints.map((p) => p.peso));
    const HeatmapLayer = google.maps.visualization.HeatmapLayer as unknown as HeatmapLayerCtor;
    heatRef.current = new HeatmapLayer({
      data: heatPoints.map((p) => ({
        location: new google.maps.LatLng(p.lat, p.lng),
        weight: maxPeso > 0 ? p.peso / maxPeso : 0,
      })),
      radius: 32, opacity: 0.75, gradient: HEAT_GRADIENT,
    });
    heatRef.current.setMap(map);
  }, [heatPoints, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((m) => m.setMap(null));
    markersRef.current = (pins || []).map((p) => {
      const marker = new google.maps.Marker({
        position: { lat: p.lat, lng: p.lng },
        map,
        icon: { url: pinIconUrl(p.color), scaledSize: new google.maps.Size(28, 28), anchor: new google.maps.Point(14, 28) },
      });
      const html = `<b>${escapeHtml(p.title)}</b>${p.subtitle ? `<br>${escapeHtml(p.subtitle)}` : ''}`;
      marker.addListener('mouseover', () => { infoWindowRef.current?.setContent(html); infoWindowRef.current?.open(map, marker); });
      marker.addListener('mouseout', () => infoWindowRef.current?.close());
      return marker;
    });
  }, [pins, ready]);

  // Encuadra todos los puntos cada vez que cambian los datos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const coords = [...(heatPoints ?? []), ...(pins ?? [])];
    if (!coords.length) return;
    const bounds = new google.maps.LatLngBounds();
    coords.forEach((p) => bounds.extend({ lat: p.lat, lng: p.lng }));
    map.fitBounds(bounds, 40);
  }, [heatPoints, pins, ready]);

  if (error) {
    return (
      <div style={{ height, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f2f5f2', borderRadius: 10, color: '#8a978f', fontSize: 13, textAlign: 'center', padding: 16 }}>
        No se pudo cargar Google Maps: {error}
      </div>
    );
  }
  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

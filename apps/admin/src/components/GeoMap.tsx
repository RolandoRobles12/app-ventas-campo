import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet.heat';

export interface HeatPoint { lat: number; lng: number; peso: number }
export interface MapPin { id: string; lat: number; lng: number; color: string; title: string; subtitle?: string }

// Centro de la zona metropolitana de Guadalajara mientras no hay puntos que encuadrar.
const DEFAULT_CENTER: L.LatLngExpression = [20.6597, -103.3496];

// Rampa secuencial YlOrRd (ColorBrewer): perceptualmente ordenada y segura para daltonismo.
const HEAT_GRADIENT: Record<number, string> = {
  0.2: '#ffffb2', 0.45: '#fecc5c', 0.65: '#fd8d3c', 0.85: '#f03b20', 1: '#bd0026',
};

function pinIcon(color: string): L.DivIcon {
  return L.divIcon({
    className: '',
    html: `<svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1.6" style="filter:drop-shadow(0 3px 4px rgba(0,0,0,.3))"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#fff" stroke="none"/></svg>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });
}

export function GeoMap({ heatPoints, pins, height }: { heatPoints?: HeatPoint[]; pins?: MapPin[]; height: number | string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const heatRef = useRef<L.HeatLayer | null>(null);
  const pinsRef = useRef<L.LayerGroup | null>(null);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = L.map(containerRef.current, { center: DEFAULT_CENTER, zoom: 12, scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);
    mapRef.current = map;
    return () => { map.remove(); mapRef.current = null; heatRef.current = null; pinsRef.current = null; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (heatRef.current) { map.removeLayer(heatRef.current); heatRef.current = null; }
    if (!heatPoints?.length) return;
    const maxPeso = Math.max(...heatPoints.map((p) => p.peso));
    heatRef.current = L.heatLayer(
      heatPoints.map((p) => [p.lat, p.lng, p.peso / maxPeso]),
      { radius: 32, blur: 22, minOpacity: 0.35, gradient: HEAT_GRADIENT },
    ).addTo(map);
  }, [heatPoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (pinsRef.current) { map.removeLayer(pinsRef.current); pinsRef.current = null; }
    if (!pins?.length) return;
    const group = L.layerGroup(pins.map((p) =>
      L.marker([p.lat, p.lng], { icon: pinIcon(p.color) })
        .bindTooltip(`<b>${escapeHtml(p.title)}</b>${p.subtitle ? `<br>${escapeHtml(p.subtitle)}` : ''}`, { direction: 'top', offset: [0, -26] }),
    ));
    group.addTo(map);
    pinsRef.current = group;
  }, [pins]);

  // Encuadra todos los puntos cada vez que cambian los datos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const coords: [number, number][] = [...(heatPoints ?? []), ...(pins ?? [])].map((p) => [p.lat, p.lng]);
    if (!coords.length) return;
    map.fitBounds(L.latLngBounds(coords).pad(0.2), { maxZoom: 15 });
  }, [heatPoints, pins]);

  return <div ref={containerRef} style={{ height, width: '100%' }} />;
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
}

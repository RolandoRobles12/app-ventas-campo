import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '../lib/googleMaps';

export interface HeatPoint { lat: number; lng: number; peso: number }
export interface MapPin { id: string; lat: number; lng: number; color: string; title: string; subtitle?: string }

// Centro de la zona metropolitana de Guadalajara mientras no hay puntos que encuadrar.
const DEFAULT_CENTER = { lat: 20.6597, lng: -103.3496 };

// Misma rampa secuencial YlOrRd (ColorBrewer) que ya se usaba con Leaflet.heat
// y luego con el HeatmapLayer de Google.
const HEAT_GRADIENT = [
  'rgba(255,255,178,0)', '#ffffb2', '#fecc5c', '#fd8d3c', '#f03b20', '#bd0026',
];

const HEAT_RADIUS = 22;
const HEAT_BLUR = 18;
const HEAT_OPACITY = 0.75;
const HEAT_MIN_ALPHA = 0.05; // piso de opacidad: hasta un solo punto se nota

// google.maps.visualization.HeatmapLayer ya no existe: Google la quitó del
// runtime de la Maps JavaScript API a partir de v3.65 (antes solo estaba
// deprecada en los tipos pero seguía funcionando; ahora truena "Uncaught
// Error: The Heatmap Layer functionality... is no longer available"). En vez
// de depender de otra librería de mapas, se dibuja el heatmap a mano con un
// OverlayView (un canvas posicionado encima del mapa real de Google) usando
// el mismo algoritmo de simpleheat/Leaflet.heat: por cada punto se pinta un
// "blob" gris difuminado y semitransparente (más opaco entre más pese el
// punto); al final se recolorea cada pixel según su opacidad acumulada con
// el degradado de arriba.
interface HeatmapOverlay extends google.maps.OverlayView {
  setData(points: HeatPoint[]): void;
}
type HeatmapOverlayCtor = new (opts: { radius: number; blur: number; opacity: number; gradient: string[] }) => HeatmapOverlay;

let heatmapOverlayClass: HeatmapOverlayCtor | null = null;

function buildGradientLut(stops: string[]): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 0, 0, 256);
  stops.forEach((color, i) => gradient.addColorStop(i / (stops.length - 1), color));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1, 256);
  return ctx.getImageData(0, 0, 1, 256).data;
}

// La clase extiende google.maps.OverlayView, que solo existe en runtime
// después de cargar el script — por eso se construye perezosamente (no se
// puede hacer `class X extends google.maps.OverlayView` a nivel de módulo).
function getHeatmapOverlayClass(): HeatmapOverlayCtor {
  if (heatmapOverlayClass) return heatmapOverlayClass;

  class Overlay extends google.maps.OverlayView implements HeatmapOverlay {
    private canvas = document.createElement('canvas');
    private ctx = this.canvas.getContext('2d')!;
    private dot: HTMLCanvasElement | null = null;
    private points: HeatPoint[] = [];
    private readonly radius: number;
    private readonly blur: number;
    private readonly gradientLut: Uint8ClampedArray;

    constructor(opts: { radius: number; blur: number; opacity: number; gradient: string[] }) {
      super();
      this.radius = opts.radius;
      this.blur = opts.blur;
      this.gradientLut = buildGradientLut(opts.gradient);
      this.canvas.style.position = 'absolute';
      this.canvas.style.pointerEvents = 'none';
      this.canvas.style.opacity = String(opts.opacity);
    }

    // Plantilla reutilizable: un círculo negro difuminado (vía shadowBlur)
    // — se pinta una vez por overlay y se reusa para cada punto, solo
    // variando la opacidad con la que se dibuja.
    private dotTemplate(): HTMLCanvasElement {
      if (this.dot) return this.dot;
      const r = this.radius + this.blur;
      const tpl = document.createElement('canvas');
      tpl.width = tpl.height = r * 2;
      const ctx = tpl.getContext('2d')!;
      ctx.shadowOffsetX = ctx.shadowOffsetY = r * 2;
      ctx.shadowBlur = this.blur;
      ctx.shadowColor = 'black';
      ctx.beginPath();
      ctx.arc(-r, -r, this.radius, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.fill();
      this.dot = tpl;
      return tpl;
    }

    setData(points: HeatPoint[]) {
      this.points = points;
      this.draw();
    }

    onAdd() {
      this.getPanes()!.overlayLayer.appendChild(this.canvas);
      this.draw();
    }

    onRemove() {
      this.canvas.parentElement?.removeChild(this.canvas);
    }

    // Se llama automáticamente cada vez que cambia la proyección (pan/zoom) —
    // aquí se reposiciona y se re-renderiza el contenido con las coordenadas
    // de pixel vigentes, igual que hacía el HeatmapLayer nativo.
    draw() {
      const projection = this.getProjection();
      const map = this.getMap() as google.maps.Map | null;
      if (!projection || !map) return;
      const bounds = map.getBounds();
      if (!bounds) return;

      const ne = projection.fromLatLngToDivPixel(bounds.getNorthEast())!;
      const sw = projection.fromLatLngToDivPixel(bounds.getSouthWest())!;
      const width = Math.max(1, Math.round(ne.x - sw.x));
      const height = Math.max(1, Math.round(sw.y - ne.y));
      this.canvas.style.left = `${sw.x}px`;
      this.canvas.style.top = `${ne.y}px`;
      this.canvas.width = width;
      this.canvas.height = height;
      this.ctx.clearRect(0, 0, width, height);

      if (!this.points.length) return;

      const r = this.radius + this.blur;
      const template = this.dotTemplate();
      const maxPeso = Math.max(1e-6, ...this.points.map((p) => p.peso));

      for (const p of this.points) {
        const pixel = projection.fromLatLngToDivPixel(new google.maps.LatLng(p.lat, p.lng));
        if (!pixel) continue;
        const x = pixel.x - sw.x;
        const y = pixel.y - ne.y;
        if (x < -r || y < -r || x > width + r || y > height + r) continue;
        this.ctx.globalAlpha = Math.min(1, Math.max(p.peso / maxPeso, HEAT_MIN_ALPHA));
        this.ctx.drawImage(template, x - r, y - r);
      }
      this.ctx.globalAlpha = 1;

      const image = this.ctx.getImageData(0, 0, width, height);
      const pixels = image.data;
      for (let i = 0; i < pixels.length; i += 4) {
        const alpha = pixels[i + 3];
        if (!alpha) continue;
        const j = alpha * 4;
        pixels[i] = this.gradientLut[j];
        pixels[i + 1] = this.gradientLut[j + 1];
        pixels[i + 2] = this.gradientLut[j + 2];
      }
      this.ctx.putImageData(image, 0, 0);
    }
  }

  heatmapOverlayClass = Overlay;
  return heatmapOverlayClass;
}

function pinIconUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="1.6"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3" fill="#fff" stroke="none"/></svg>`;
  return `data:image/svg+xml;base64,${btoa(svg)}`;
}

export function GeoMap({ heatPoints, pins, height }: { heatPoints?: HeatPoint[]; pins?: MapPin[]; height: number | string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const heatRef = useRef<HeatmapOverlay | null>(null);
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
    if (!heatRef.current) {
      const Overlay = getHeatmapOverlayClass();
      heatRef.current = new Overlay({ radius: HEAT_RADIUS, blur: HEAT_BLUR, opacity: HEAT_OPACITY, gradient: HEAT_GRADIENT });
      heatRef.current.setMap(map);
    }
    heatRef.current.setData(heatPoints ?? []);
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

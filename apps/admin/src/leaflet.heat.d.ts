// leaflet.heat no publica tipos; declaramos lo que usamos.
import 'leaflet';

declare module 'leaflet' {
  interface HeatLayerOptions {
    minOpacity?: number;
    maxZoom?: number;
    max?: number;
    radius?: number;
    blur?: number;
    gradient?: Record<number, string>;
  }

  interface HeatLayer extends Layer {
    setLatLngs(latlngs: Array<[number, number, number]>): HeatLayer;
    redraw(): HeatLayer;
  }

  function heatLayer(latlngs: Array<[number, number, number]>, options?: HeatLayerOptions): HeatLayer;
}

declare module 'leaflet.heat' {}

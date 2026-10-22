import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@aviva/ui';

export interface LatLng { lat: number; lng: number }
export interface PuntoPreview extends LatLng { nombre: string; fechaPlan: string; orden: number }

const DEFAULT_CENTER = { lat: 20.6597, lng: -103.3496 };
export const ZONA_COLORES = ['#0f5132', '#1d5fae', '#a3471d', '#7b1da3', '#a31d5f', '#1d8fa3'];
const NARANJA = '#e07a26';
const VERDE_PUNTO = '#5fae86';

const valido = (p: LatLng[]) => p.length >= 3;

// Mapa del planeador de rutas: un solo mapa grande donde se elige la zona
// (clic = centro del círculo, o clic = esquinas de la zona dibujada) y se ve
// el resultado. Los negocios de la vista previa van en verde; los del día
// seleccionado, en naranja con su número de parada y la línea del recorrido.
// google.maps.drawing.DrawingManager ya no existe en la API (v3.65+), así que
// los polígonos se arman con clics, igual que antes en LocationPickerMap.
export function PlannerMap({
  centro, radioMetros, onCentro, modoDibujo, poligonos, poligonoActivo, onPoligonos,
  existentes, preview, diaSeleccionado, onElegirDia, encuadrarToken, alto,
}: {
  centro: LatLng | null; radioMetros: number; onCentro: (p: LatLng) => void;
  modoDibujo: boolean; poligonos: LatLng[][]; poligonoActivo: number; onPoligonos: (z: LatLng[][]) => void;
  existentes: (LatLng & { nombre: string })[];
  preview: PuntoPreview[]; diaSeleccionado: string | null; onElegirDia: (fecha: string) => void;
  encuadrarToken: number; alto: number | string;
}) {
  const contenedor = useRef<HTMLDivElement>(null);
  const mapa = useRef<google.maps.Map | null>(null);
  const [listo, setListo] = useState(false);
  const [error, setError] = useState('');

  // Los listeners del mapa se registran una sola vez: leen siempre el valor
  // vigente de estos refs, no el del render en que se crearon.
  const modoDibujoRef = useRef(modoDibujo);
  const onCentroRef = useRef(onCentro);
  const poligonosRef = useRef(poligonos);
  const activoRef = useRef(poligonoActivo);
  const onPoligonosRef = useRef(onPoligonos);
  const onElegirDiaRef = useRef(onElegirDia);
  modoDibujoRef.current = modoDibujo;
  onCentroRef.current = onCentro;
  poligonosRef.current = poligonos;
  activoRef.current = poligonoActivo;
  onPoligonosRef.current = onPoligonos;
  onElegirDiaRef.current = onElegirDia;

  const centroMarker = useRef<google.maps.Marker | null>(null);
  const circulo = useRef<google.maps.Circle | null>(null);
  const poligonosOverlay = useRef<google.maps.Polygon[]>([]);
  const existentesMarkers = useRef<google.maps.Marker[]>([]);
  const previewMarkers = useRef<google.maps.Marker[]>([]);
  const linea = useRef<google.maps.Polyline | null>(null);
  // true mientras se copia al mapa un cambio que vino del padre, para que los
  // listeners del path no lo devuelvan como si fuera una edición en el mapa.
  const aplicando = useRef(false);

  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps().then((g) => {
      if (cancelado || !contenedor.current || mapa.current) return;
      const m = new g.maps.Map(contenedor.current, {
        center: centro ?? DEFAULT_CENTER, zoom: centro ? 14 : 12, streetViewControl: false, mapTypeControl: false,
        fullscreenControl: false, clickableIcons: false, tilt: 0, rotateControl: false,
      });
      m.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (!e.latLng) return;
        if (modoDibujoRef.current) {
          const zonas = poligonosRef.current.map((z) => z.slice());
          const idx = Math.min(activoRef.current, zonas.length - 1);
          zonas[idx] = [...(zonas[idx] ?? []), { lat: e.latLng.lat(), lng: e.latLng.lng() }];
          onPoligonosRef.current(zonas);
        } else {
          onCentroRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }
      });
      mapa.current = m;
      setListo(true);
    }).catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Centro + círculo de búsqueda (solo cuando no hay zonas dibujadas: esas mandan).
  const hayPoligonos = poligonos.some(valido);
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    if (!centro) {
      centroMarker.current?.setMap(null); centroMarker.current = null;
      circulo.current?.setMap(null); circulo.current = null;
      return;
    }
    if (!centroMarker.current) {
      centroMarker.current = new google.maps.Marker({ map: m, draggable: true, title: 'Centro de la zona (arrástralo para moverlo)', zIndex: 500 });
      centroMarker.current.addListener('dragend', () => {
        const p = centroMarker.current!.getPosition()!;
        onCentroRef.current({ lat: p.lat(), lng: p.lng() });
      });
    }
    centroMarker.current.setPosition(centro);
    centroMarker.current.setMap(hayPoligonos ? null : m);
    if (!circulo.current) {
      circulo.current = new google.maps.Circle({ map: m, fillColor: '#157347', fillOpacity: 0.08, strokeColor: '#0f5132', strokeWeight: 1.5, clickable: false });
    }
    circulo.current.setCenter(centro);
    circulo.current.setRadius(radioMetros);
    circulo.current.setMap(hayPoligonos ? null : m);
  }, [centro, radioMetros, hayPoligonos, listo]);

  // Zonas dibujadas: un google.maps.Polygon editable por zona.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    while (poligonosOverlay.current.length > poligonos.length) poligonosOverlay.current.pop()!.setMap(null);
    while (poligonosOverlay.current.length < poligonos.length) {
      const idx = poligonosOverlay.current.length;
      const color = ZONA_COLORES[idx % ZONA_COLORES.length];
      const poly = new google.maps.Polygon({ map: m, editable: true, fillColor: color, fillOpacity: 0.12, strokeColor: color, strokeWeight: 2.5 });
      const sincronizar = () => {
        if (aplicando.current) return;
        const path = poly.getPath();
        const pts: LatLng[] = [];
        for (let i = 0; i < path.getLength(); i++) pts.push({ lat: path.getAt(i).lat(), lng: path.getAt(i).lng() });
        if (JSON.stringify(pts) === JSON.stringify(poligonosRef.current[idx] ?? [])) return;
        const zonas = poligonosRef.current.slice();
        zonas[idx] = pts;
        onPoligonosRef.current(zonas);
      };
      poly.getPath().addListener('set_at', sincronizar);
      poly.getPath().addListener('insert_at', sincronizar);
      poly.getPath().addListener('remove_at', sincronizar);
      poligonosOverlay.current.push(poly);
    }
    poligonosOverlay.current.forEach((poly, i) => {
      const actual: LatLng[] = [];
      const path = poly.getPath();
      for (let j = 0; j < path.getLength(); j++) actual.push({ lat: path.getAt(j).lat(), lng: path.getAt(j).lng() });
      // Se modifica el mismo path (no setPath, que lo reemplaza y deja atrás
      // los listeners de arrastre de vértices).
      if (JSON.stringify(actual) !== JSON.stringify(poligonos[i])) {
        aplicando.current = true;
        path.clear();
        poligonos[i].forEach((pt) => path.push(new google.maps.LatLng(pt.lat, pt.lng)));
        aplicando.current = false;
      }
      poly.setOptions({ strokeWeight: i === poligonoActivo && modoDibujo ? 3.5 : 2 });
    });
  }, [poligonos, poligonoActivo, modoDibujo, listo]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    m.setOptions({ draggableCursor: modoDibujo ? 'crosshair' : undefined });
  }, [modoDibujo, listo]);

  // Lo que el vendedor ya tiene pendiente (gris), para no planear encima a ciegas.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    existentesMarkers.current.forEach((x) => x.setMap(null));
    existentesMarkers.current = existentes.map((p) => new google.maps.Marker({
      map: m, position: p, title: `Ya en su ruta: ${p.nombre}`, zIndex: 1,
      icon: { path: google.maps.SymbolPath.CIRCLE, scale: 4, fillColor: '#8a978f', fillOpacity: 0.8, strokeColor: '#fff', strokeWeight: 1 },
    }));
  }, [existentes, listo]);

  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    previewMarkers.current.forEach((x) => x.setMap(null));
    linea.current?.setMap(null);
    const delDia = preview.filter((p) => p.fechaPlan === diaSeleccionado).sort((a, b) => a.orden - b.orden);
    previewMarkers.current = preview.map((p) => {
      const sel = p.fechaPlan === diaSeleccionado;
      const mk = new google.maps.Marker({
        map: m, position: p, zIndex: sel ? 300 + (100 - p.orden) : 10, title: p.nombre,
        label: sel ? { text: String(p.orden), color: '#fff', fontSize: '11px', fontWeight: '700' } : undefined,
        icon: {
          path: google.maps.SymbolPath.CIRCLE, scale: sel ? 11 : 5,
          fillColor: sel ? NARANJA : VERDE_PUNTO, fillOpacity: 1, strokeColor: '#fff', strokeWeight: sel ? 2 : 1,
        },
      });
      mk.addListener('click', () => onElegirDiaRef.current(p.fechaPlan));
      return mk;
    });
    if (delDia.length > 1) {
      linea.current = new google.maps.Polyline({ map: m, path: delDia, strokeColor: NARANJA, strokeOpacity: 0.8, strokeWeight: 3, zIndex: 50 });
    }
  }, [preview, diaSeleccionado, listo]);

  // Encuadre: todo (cuando el padre lo pide) o el día seleccionado.
  const encuadrar = (puntos: LatLng[], conCirculo: boolean) => {
    const m = mapa.current;
    if (!m) return;
    const b = new google.maps.LatLngBounds();
    puntos.forEach((p) => b.extend(p));
    if (conCirculo && circulo.current?.getMap()) {
      const cb = circulo.current.getBounds();
      if (cb) b.union(cb);
    }
    if (!b.isEmpty()) m.fitBounds(b, 50);
  };
  useEffect(() => {
    if (!listo) return;
    encuadrar([...poligonos.flat(), ...preview, ...(centro ? [centro] : []), ...(preview.length ? [] : existentes)], true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [encuadrarToken, listo]);
  useEffect(() => {
    if (!listo || !diaSeleccionado) return;
    encuadrar(preview.filter((p) => p.fechaPlan === diaSeleccionado), false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [diaSeleccionado]);

  if (error) {
    return (
      <div style={{ height: alto, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f2f5f2', color: '#8a978f', fontSize: 13, textAlign: 'center', padding: 16 }}>
        No se pudo cargar Google Maps: {error}
      </div>
    );
  }
  return <div ref={contenedor} style={{ height: alto, width: '100%' }} />;
}

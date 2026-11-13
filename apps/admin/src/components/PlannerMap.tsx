import { useEffect, useRef, useState } from 'react';
import { loadGoogleMaps } from '@aviva/ui';

export interface LatLng { lat: number; lng: number }
export interface PuntoPreview extends LatLng { nombre: string; fechaPlan: string; orden: number }
// Una zona de búsqueda: círculo (centro + radio) o contorno (poligono != null,
// aunque todavía esté vacío mientras se dibuja).
export interface AreaMapa { centro: LatLng | null; radio: number; poligono: LatLng[] | null }
// Zona donde el vendedor no puede ir. `tenue`: de otro vendedor, mostrada
// solo como opción para reutilizarla.
export interface ZonaProhibidaMapa { id: string; nombre: string; puntos: LatLng[]; tenue?: boolean }

const DEFAULT_CENTER = { lat: 20.6597, lng: -103.3496 };
export const ZONA_COLORES = ['#0f5132', '#1d5fae', '#a3471d', '#7b1da3', '#a31d5f', '#1d8fa3'];
export const ROJO_PROHIBIDA = '#c62828';
const NARANJA = '#e07a26';
const VERDE_PUNTO = '#5fae86';

type Editable = { poly: google.maps.Polygon; poner: (pts: LatLng[]) => void; quitar: () => void };

// Polígono editable cuyo contorno se sincroniza en las dos direcciones: lo
// que llega del padre se copia al mapa (sin reemplazar el path, para no
// perder los listeners de arrastre de vértices) y lo que se edita en el mapa
// se avisa con `onCambio`, sin devolver como edición lo que vino del padre.
function poligonoEditable(m: google.maps.Map, opts: google.maps.PolygonOptions, onCambio: (pts: LatLng[]) => void, onClic: (p: LatLng) => void): Editable {
  const poly = new google.maps.Polygon({ map: m, editable: true, ...opts });
  const path = poly.getPath();
  let aplicando = false;
  const leer = () => {
    const pts: LatLng[] = [];
    for (let i = 0; i < path.getLength(); i++) pts.push({ lat: path.getAt(i).lat(), lng: path.getAt(i).lng() });
    return pts;
  };
  const alCambiar = () => { if (!aplicando) onCambio(leer()); };
  path.addListener('set_at', alCambiar);
  path.addListener('insert_at', alCambiar);
  path.addListener('remove_at', alCambiar);
  // Un clic dentro del polígono (no en un vértice) cuenta como clic en el mapa.
  poly.addListener('click', (e: google.maps.PolyMouseEvent) => {
    if (e.vertex == null && e.edge == null && e.latLng) onClic({ lat: e.latLng.lat(), lng: e.latLng.lng() });
  });
  return {
    poly,
    poner: (pts) => {
      if (JSON.stringify(pts) === JSON.stringify(leer())) return;
      aplicando = true;
      path.clear();
      pts.forEach((p) => path.push(new google.maps.LatLng(p.lat, p.lng)));
      aplicando = false;
    },
    quitar: () => poly.setMap(null),
  };
}

type OverlayArea =
  | { tipo: 'circulo'; marker: google.maps.Marker; circle: google.maps.Circle }
  | { tipo: 'poligono'; ed: Editable };

// Mapa del planeador de rutas: un solo mapa grande donde se eligen las zonas
// (clic = centro del círculo de la zona activa, o una esquina si es una zona
// dibujada), las zonas donde el vendedor no puede ir (en rojo) y se ve el
// resultado. Los negocios de la vista previa van en verde; los del día
// seleccionado, en naranja con su número de parada y la línea del recorrido.
// google.maps.drawing.DrawingManager ya no existe en la API (v3.65+), así que
// los polígonos se arman con clics.
export function PlannerMap({
  areas, areaActiva, onArea, restringidas, editandoRestringida, onEditandoRestringida,
  existentes, preview, diaSeleccionado, onElegirDia, encuadrarToken, alto,
}: {
  areas: AreaMapa[]; areaActiva: number; onArea: (i: number, cambio: Partial<AreaMapa>) => void;
  restringidas: ZonaProhibidaMapa[];
  editandoRestringida: LatLng[] | null; onEditandoRestringida: (pts: LatLng[]) => void;
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
  const props = useRef({ areas, areaActiva, onArea, editandoRestringida, onEditandoRestringida, onElegirDia });
  props.current = { areas, areaActiva, onArea, editandoRestringida, onEditandoRestringida, onElegirDia };

  const clic = (p: LatLng) => {
    const { areas: as, areaActiva: i, onArea: cambiar, editandoRestringida: r, onEditandoRestringida: cambiarR } = props.current;
    if (r) return cambiarR([...r, p]);
    const a = as[i];
    if (!a) return;
    if (a.poligono) cambiar(i, { poligono: [...a.poligono, p] });
    else cambiar(i, { centro: p });
  };
  const clicRef = useRef(clic);
  clicRef.current = clic;

  const overlaysAreas = useRef<OverlayArea[]>([]);
  const prohibidas = useRef<google.maps.Polygon[]>([]);
  const editRestringida = useRef<Editable | null>(null);
  const existentesMarkers = useRef<google.maps.Marker[]>([]);
  const previewMarkers = useRef<google.maps.Marker[]>([]);
  const linea = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    let cancelado = false;
    loadGoogleMaps().then((g) => {
      if (cancelado || !contenedor.current || mapa.current) return;
      const inicial = areas.find((a) => a.centro)?.centro ?? areas.find((a) => a.poligono?.length)?.poligono?.[0] ?? null;
      const m = new g.maps.Map(contenedor.current, {
        center: inicial ?? DEFAULT_CENTER, zoom: inicial ? 14 : 12, streetViewControl: false, mapTypeControl: false,
        fullscreenControl: false, clickableIcons: false, tilt: 0, rotateControl: false,
      });
      m.addListener('click', (e: google.maps.MapMouseEvent) => {
        if (e.latLng) clicRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() });
      });
      mapa.current = m;
      setListo(true);
    }).catch((err) => !cancelado && setError(err.message));
    return () => { cancelado = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Zonas de búsqueda: un círculo con su centro arrastrable, o un contorno
  // editable. Si cambia cuántas hay o de qué tipo, se rearman todas (los
  // listeners guardan su índice).
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    const tipos = areas.map((a) => (a.poligono ? 'poligono' : 'circulo'));
    if (tipos.join() !== overlaysAreas.current.map((o) => o.tipo).join()) {
      overlaysAreas.current.forEach((o) => {
        if (o.tipo === 'circulo') { o.marker.setMap(null); o.circle.setMap(null); } else o.ed.quitar();
      });
      overlaysAreas.current = areas.map((a, i): OverlayArea => {
        const color = ZONA_COLORES[i % ZONA_COLORES.length];
        if (a.poligono) {
          return {
            tipo: 'poligono',
            ed: poligonoEditable(m, { fillColor: color, fillOpacity: 0.12, strokeColor: color, strokeWeight: 2.5 },
              (pts) => props.current.onArea(i, { poligono: pts }), (p) => clicRef.current(p)),
          };
        }
        const marker = new google.maps.Marker({ map: m, draggable: true, title: 'Centro de la zona (arrástralo para moverlo)', zIndex: 500 });
        marker.addListener('dragend', () => {
          const p = marker.getPosition()!;
          props.current.onArea(i, { centro: { lat: p.lat(), lng: p.lng() } });
        });
        const circle = new google.maps.Circle({ map: m, fillColor: color, fillOpacity: 0.08, strokeColor: color, strokeWeight: 1.5, clickable: true });
        circle.addListener('click', (e: google.maps.MapMouseEvent) => e.latLng && clicRef.current({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
        return { tipo: 'circulo', marker, circle };
      });
    }
    overlaysAreas.current.forEach((o, i) => {
      const a = areas[i];
      const activa = i === areaActiva && !editandoRestringida;
      if (o.tipo === 'poligono') {
        o.ed.poner(a.poligono ?? []);
        o.ed.poly.setOptions({ editable: activa, strokeWeight: activa ? 3.5 : 2 });
      } else {
        o.marker.setMap(a.centro ? m : null);
        o.circle.setMap(a.centro ? m : null);
        if (a.centro) {
          o.marker.setPosition(a.centro);
          o.circle.setCenter(a.centro);
          o.circle.setRadius(a.radio);
          o.circle.setOptions({ strokeWeight: activa ? 3 : 1.5 });
        }
      }
    });
  }, [areas, areaActiva, editandoRestringida, listo]);

  // Zonas donde no puede ir: rojo, fijas. Las tenues (de otros vendedores)
  // solo se muestran mientras se elige cuál reutilizar.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    prohibidas.current.forEach((p) => p.setMap(null));
    prohibidas.current = restringidas.filter((z) => z.puntos.length >= 3).map((z) => new google.maps.Polygon({
      map: m, paths: z.puntos, clickable: false, zIndex: z.tenue ? 1 : 5,
      fillColor: ROJO_PROHIBIDA, fillOpacity: z.tenue ? 0.06 : 0.22,
      strokeColor: ROJO_PROHIBIDA, strokeOpacity: z.tenue ? 0.5 : 0.9, strokeWeight: z.tenue ? 1.5 : 2,
    }));
  }, [restringidas, listo]);

  // La zona prohibida que se está dibujando.
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    if (!editandoRestringida) {
      editRestringida.current?.quitar();
      editRestringida.current = null;
      return;
    }
    if (!editRestringida.current) {
      editRestringida.current = poligonoEditable(m, { fillColor: ROJO_PROHIBIDA, fillOpacity: 0.25, strokeColor: ROJO_PROHIBIDA, strokeWeight: 3, zIndex: 20 },
        (pts) => props.current.onEditandoRestringida(pts), (p) => clicRef.current(p));
    }
    editRestringida.current.poner(editandoRestringida);
  }, [editandoRestringida, listo]);

  const dibujando = !!editandoRestringida || !!areas[areaActiva]?.poligono;
  useEffect(() => {
    const m = mapa.current;
    if (!m || !listo) return;
    m.setOptions({ draggableCursor: dibujando ? 'crosshair' : undefined });
  }, [dibujando, listo]);

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
      mk.addListener('click', () => props.current.onElegirDia(p.fechaPlan));
      return mk;
    });
    if (delDia.length > 1) {
      linea.current = new google.maps.Polyline({ map: m, path: delDia, strokeColor: NARANJA, strokeOpacity: 0.8, strokeWeight: 3, zIndex: 50 });
    }
  }, [preview, diaSeleccionado, listo]);

  // Encuadre: todo (cuando el padre lo pide) o el día seleccionado.
  const encuadrar = (puntos: LatLng[], conCirculos: boolean) => {
    const m = mapa.current;
    if (!m) return;
    const b = new google.maps.LatLngBounds();
    puntos.forEach((p) => b.extend(p));
    if (conCirculos) {
      overlaysAreas.current.forEach((o) => {
        const cb = o.tipo === 'circulo' && o.circle.getMap() ? o.circle.getBounds() : null;
        if (cb) b.union(cb);
      });
    }
    if (!b.isEmpty()) m.fitBounds(b, 50);
  };
  useEffect(() => {
    if (!listo) return;
    const zonas = areas.flatMap((a) => a.poligono ?? (a.centro ? [a.centro] : []));
    encuadrar([...zonas, ...preview, ...(preview.length ? [] : existentes)], true);
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

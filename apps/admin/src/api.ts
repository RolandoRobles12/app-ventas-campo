import { getIdToken } from '@aviva/ui';

export interface Producto { id: string; nombre: string; esDeCampo: boolean; giros: string[]; }
export interface ZonaPunto { lat: number; lng: number }

// Una zona de búsqueda de la ruta: círculo (centro + radio) o contorno
// dibujado. Una ruta puede juntar varias zonas vecinas.
export interface AreaRuta {
  etiqueta: string;
  lat: number | null;
  lng: number | null;
  radioMetros: number;
  poligono: ZonaPunto[] | null;
}
export interface RutaConfig {
  zonas: AreaRuta[];
  giros: string[];
  // Meta total del día; de ella, `propiosPorDia` son negocios nuevos que
  // encuentra el vendedor (la ruta trae la diferencia).
  visitasPorDia: number;
  propiosPorDia: number;
  dias: number[];
  semanas: number;
}

// Zona donde uno o varios vendedores no pueden visitar ni prospectar.
export interface ZonaRestringida {
  id: string; nombre: string; motivo: string | null; mostrarMotivo: boolean;
  puntos: ZonaPunto[]; vendedorIds: string[]; actualizadoEn: string | null;
}
export type ZonaRestringidaNueva = Omit<ZonaRestringida, 'id' | 'actualizadoEn'>;

export interface Vendedor {
  id: string; nombre: string; iniciales: string; color: string; email: string | null;
  estado: 'Activo' | 'Baja';
  producto: string; productoId: string; giros: string[];
  puesto: string | null; zona: string | null; tienda: string | null;
  hubManagerNombre: string | null; headNombre: string | null;
  fuente: string | null; bajaEn: string | null; bajaMotivo: string | null;
  rutaConfig: RutaConfig | null;
  // Vendedor de prueba de un admin: no cuenta en los indicadores.
  prueba?: boolean;
  rutaAnterior: { etiqueta: string; poligonos: ZonaPunto[][] | null } | null;
  // Se graban todas sus sesiones de la app hasta este día (YYYY-MM-DD).
  grabarHasta?: string | null;
}

export interface Prospecto {
  id: string; vendedorId: string; negocioId: string; nombre: string; direccion: string; giro?: string | null;
  distanciaKm?: number | null; telefono?: string | null; origen: string; estado: string;
  lat?: number | null; lng?: number | null;
  fechaPlan?: string | null; orden?: number | null; reagendado?: boolean;
  semanaInicio?: string | null; semanaHasta?: string | null;
}

export interface EstadoRuta {
  vendedorId: string; pendientes: number; conFecha: number; sinFecha: number; atrasadas: number; hoy: number;
  hasta: string | null; diasRestantes: number | null; tieneConfig: boolean; zona: string | null; visitasPorDia: number | null;
}

export interface ItemRuta {
  negocioId?: string | null; denueId?: string | null;
  nombre: string; direccion: string; giro?: string | null; telefono?: string | null;
  lat?: number | null; lng?: number | null; distanciaKm?: number | null;
  fechaPlan: string; orden: number; manual?: boolean;
}
export interface RutaGenerada {
  items: ItemRuta[]; fechas: string[]; necesarios: number; encontrados: number;
  centro: ZonaPunto; centros: ZonaPunto[];
}

export interface ReporteSync {
  ok: boolean; fecha: string; origen: 'manual' | 'programada'; actor: string | null;
  totalColaboradores: number; enProductosCampo: number;
  altas: { nombre: string; producto: string }[];
  bajas: { nombre: string; motivo: string }[];
  reactivados: { nombre: string }[];
  actualizados: number; sinColaborador: number; detenido: string | null;
}
export interface EstadoEquipo {
  configurado: boolean;
  productos: { id: string; nombre: string; esDeCampo: boolean; giros: string[] }[];
  girosDisponibles: string[];
  ultimo: ReporteSync | null;
}

export type VistaTablero = 'dia' | 'semana' | 'mes' | 'rango';
export interface BloqueTablero {
  visitas: number; negociosVisitados: number; negociosReales: number; noValidos: number; interesados: number;
  // meta = metaRuta (planeados) + metaPropios (negocios nuevos a encontrar).
  meta: number; metaRuta: number; metaPropios: number; rutaVisitados: number; propios: number;
  metaVisitados: number; avanceMeta: number | null;
  // null mientras HubSpot no está conectado o falló.
  marcadas: number; confirmadasVisitas: number | null; solicitudes: number | null;
  aprobadas: number | null; rechazadas: number | null; enProceso: number | null;
  // Desembolsadas (cuentan también como aprobadas) y la suma de su monto.
  desembolsadas: number | null; montoDesembolsado: number | null;
  conversion: number | null; aprobacion: number | null; confirmacion: number | null;
  // De las aprobadas, % ya desembolsadas.
  desembolso: number | null;
  // Visitas a las que se les corrigió el resultado (tipificaron mal).
  corregidas: number;
  validables: number; enNegocio: number | null;
  // Visitas que no se pueden comprobar (no cuentan en enNegocio), por motivo.
  sinComprobar: { nuevo: number; sinGps: number; sinUbicacion: number };
}
export interface RangoTablero { desde: string; hasta: string; inicio: string; fin: string }
export interface VendedorTablero extends BloqueTablero {
  id: string; nombre: string; iniciales: string; color: string; producto: string; activo: boolean;
  sinUsuarioHubspot: boolean; ultimaVisita: string | null;
}
export interface Tablero {
  vista: VistaTablero; hoy: string; enCurso: boolean; tendenciaPor: 'dia' | 'semana' | 'mes';
  periodo: RangoTablero; anterior: RangoTablero;
  actual: BloqueTablero; previo: BloqueTablero;
  hubspot: { estado: 'ok' | 'sin_configurar' | 'error'; mensaje?: string; vendedoresSinCuenta: string[] };
  porProducto: (BloqueTablero & { productoId: string; producto: string })[];
  porVendedor: VendedorTablero[];
  equipo: { activos: number; conVisitas: number };
  tendencia: { desde: string; hasta: string; parcial: boolean; visitas: number; marcadas: number; solicitudes: number | null; aprobadas: number | null; rechazadas: number | null }[];
}

export interface EnVivoItem {
  id: string; nombre: string; iniciales: string; color: string; producto: string; zona: string | null;
  estado: 'en_ruta' | 'inactivo' | 'sin_actividad';
  ultimaSenal: string | null; posicion: ZonaPunto | null;
  visitasHoy: number; planHoy: number; planHoyVisitados: number;
  // Negocios nuevos de hoy (todos, y los que cuentan para su meta de nuevos).
  nuevosHoy: number; propiosHoy: number; metaPropios: number;
  primeraVisita: string | null;
  ultimaVisita: { nombre: string; resultado: string; hora: string } | null;
}

export interface MapaCalorResponse {
  puntos: { lat: number; lng: number; peso: number }[];
  visitasTotales: number;
  visitasConUbicacion: number;
}
export interface RecorridoVendedor {
  vendedorId: string; nombre: string; color: string;
  puntos: { lat: number; lng: number; createdAt: string }[];
}
export interface VisitaListItem {
  id: string; vendedorId: string; vendedorNombre: string; vendedorActivo: boolean; producto: string;
  negocioId: string | null; prospectoId: string | null;
  esNegocioNuevo: boolean;
  // Negocio nuevo que cuenta para su meta (false: ya era de alguien); null si venía en la ruta.
  propio?: boolean | null;
  nombreNegocio: string; direccion: string; resultado: string;
  notas: string | null; fotos: string[]; lat: number | null; lng: number | null;
  ubicacionValida: boolean | null; distanciaValidacionMetros: number | null; createdAt: string;
  // Cerco: llegó sin señal y fuera de la distancia permitida.
  fueraDeCerco?: boolean;
  // El vendedor reportó que el negocio está en otro lugar.
  ubicacionReportada?: 'pendiente' | 'aceptada' | 'descartada' | null;
  // Señales de GPS falso ('salto': habría tenido que ir a más de 150 km/h).
  sospechaGps?: string[];
  // "Hizo solicitud": la solicitud de HubSpot ligada (por el vendedor, sola
  // o por un admin) o si sigue sin ligar.
  dealId?: string | null; dealNombre?: string | null; solicitudPendiente?: boolean;
  vinculoSolicitud?: 'vendedor' | 'auto' | 'admin' | null;
  // Se corrigió el resultado (tipificó mal): el que había puesto.
  resultadoOriginal?: string | null;
}
export interface VisitasResponse { items: VisitaListItem[]; nextCursor: string | null }
export interface HistorialNegocio {
  negocioId: string; nombre: string; direccion: string; giro: string | null; telefono: string | null;
  enRuta: { vendedorNombre: string; fechaPlan: string | null; citaHora?: string | null } | null;
  visitas: VisitaListItem[];
  // Servidores anteriores a las llamadas no lo mandan.
  llamadas?: Llamada[];
}
export type ResultadoLlamada = 'cita' | 'llamar_despues' | 'no_contesto' | 'no_interesa' | 'numero_equivocado';
export interface Llamada {
  id: string; vendedorId: string; vendedorNombre: string; producto: string;
  prospectoId: string; negocioId: string; nombreNegocio: string; direccion: string; telefono: string | null;
  resultado: ResultadoLlamada; citaFecha: string | null; citaHora: string | null; telefonoNuevo: string | null;
  notas: string | null; createdAt: string;
}
export interface CitaProxima {
  prospectoId: string; negocioId: string; vendedorId: string; vendedorNombre: string;
  nombre: string; direccion: string; telefono: string | null; citaFecha: string; citaHora: string | null;
}
export interface Usuario { email: string; nombre: string | null; createdAt: string }

// ——— Uso de la app (medición de cómo usan los vendedores la app) ———
export interface UsoVendedor {
  id: string; nombre: string; iniciales: string; color: string; grabarHasta: string | null;
  sesiones: number; dias: number; minutos: number; minutosPorDia: number;
  toques: number; rabia: number; muertos: number; errores: number;
  visitasAbiertas: number; visitasGuardadas: number; ultima: string | null;
}
export interface UsoResumen {
  totales: {
    sesiones: number; vendedores: number; minutos: number; toques: number; rabia: number; muertos: number;
    errores: number; cortesSenal: number; minutosSinSenal: number; inicios: { instalada: number; navegador: number };
  };
  dispositivos: { nombre: string; sesiones: number }[];
  pantallas: { pantalla: string; vistas: number; minutos: number; toques: number; rabia: number; vendedores: number }[];
  objetivos: { pantalla: string; objetivo: string; toques: number; rabia: number; muertos: number }[];
  mapaToques: { pantalla: string; celdas: { x: number; y: number; n: number; r: number }[] }[];
  rejilla: { x: number; y: number };
  embudos: { clave: string; titulo: string; pasos: { accion: string; etiqueta: string; intentos: number }[] }[];
  bloqueos: { motivo: string; etiqueta: string; veces: number }[];
  errores: { mensaje: string; veces: number; vendedores: number; ultima: string; pantalla: string | null }[];
  porDia: { dia: string; minutos: number; vendedores: number; sesiones: number; toques: number }[];
  porHora: number[];
  vendedores: UsoVendedor[];
  truncado: boolean;
}
export interface Grabacion {
  id: string; vendedorId: string; vendedorNombre: string; iniciales: string; color: string;
  inicio: string; fin: string; duracionSeg: number; motivo: 'muestreo' | 'pedida'; dispositivo: string | null;
  fragmentos: number; bytes: number; toques: number; rabia: number; muertos: number; errores: number; pantallas: string[];
}
export interface GrabacionDetalle extends Grabacion {
  lista: { seq: number; inicio: number; fin: number; bytes: number; toques: number; rabia: number; errores: number; pantallas: string[] }[];
}

// Un fragmento de grabación tal cual se subió (gzip): se descomprime aquí.
async function reqFragmento(sesionId: string, seq: number): Promise<unknown[]> {
  const token = await getIdToken();
  const res = await fetch(`/api/grabaciones/${encodeURIComponent(sesionId)}/fragmentos/${seq}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!res.ok) {
    const body = await res.json().catch(() => ({} as { message?: string }));
    throw new Error(body.message || `Error ${res.status}`);
  }
  const bytes = new Uint8Array(await res.arrayBuffer());
  // Si algo en el camino ya lo descomprimió, llega como JSON directo.
  const esGzip = bytes[0] === 0x1f && bytes[1] === 0x8b;
  const texto = esGzip
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).text()
    : new TextDecoder().decode(bytes);
  return JSON.parse(texto) as unknown[];
}

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const token = await getIdToken();
  const authHeader: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};
  const res = await fetch(`/api${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...authHeader, ...init?.headers } });
  const isJson = res.headers.get('content-type')?.includes('application/json');
  const body = isJson ? await res.json().catch(() => ({})) : undefined;
  if (!res.ok) {
    const err: any = new Error(body?.message || body?.error || `Error ${res.status}`);
    err.code = body?.error;
    throw err;
  }
  return body as T;
}

// Admite arreglos (selección múltiple de producto/vendedor/resultado): se
// mandan separados por coma.
function qs(params: Record<string, string | string[] | undefined | null>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (Array.isArray(value)) { if (value.length) sp.set(key, value.join(',')); }
    else if (value) sp.set(key, value);
  }
  const str = sp.toString();
  return str ? `?${str}` : '';
}

const post = (body?: unknown): RequestInit => ({ method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

export interface Filtro { productoIds?: string[]; vendedorIds?: string[]; desde?: string | null; hasta?: string | null }

export const api = {
  me: () => req<{ email: string; isAdmin: boolean }>('/auth/me'),

  usuarios: () => req<Usuario[]>('/usuarios'),
  agregarUsuario: (data: { email: string; nombre?: string }) => req<Usuario>('/usuarios', post(data)),
  eliminarUsuario: (email: string) => req<void>(`/usuarios/${encodeURIComponent(email)}`, { method: 'DELETE' }),

  productos: () => req<Producto[]>('/productos/de-campo'),
  vendedores: () => req<Vendedor[]>('/vendedores'),
  vendedor: (id: string) => req<Vendedor>(`/vendedores/${id}`),

  equipo: () => req<EstadoEquipo>('/equipo'),
  sincronizarEquipo: (forzar = false) => req<ReporteSync>('/equipo/sincronizar', post({ forzar })),
  guardarProductosEquipo: (data: { productosCampo?: string[]; giros?: Record<string, string[]> }) =>
    req<EstadoEquipo>('/equipo/productos', { method: 'PUT', body: JSON.stringify(data) }),

  rutasStatus: () => req<{ denue: boolean; googleMaps: boolean }>('/rutas/status'),
  rutasEstado: (f: { productoIds?: string[]; vendedorIds?: string[] } = {}) =>
    req<{ hoy: string; items: EstadoRuta[] }>(`/rutas/estado${qs(f)}`),
  generarRuta: (vendedorId: string, data: { config: RutaConfig; inicio: string; reemplazarPendientes: boolean }) =>
    req<RutaGenerada>(`/rutas/${vendedorId}/generar`, post(data)),
  publicarRuta: (vendedorId: string, data: { config: RutaConfig; inicio: string; items: ItemRuta[]; reemplazarPendientes: boolean; centros?: ZonaPunto[] }) =>
    req<{ creados: number; eliminados: number; desde: string | null; hasta: string | null }>(`/rutas/${vendedorId}/publicar`, post(data)),
  renovarRuta: (vendedorId: string) =>
    req<{ creados: number; desde: string | null; hasta: string | null; necesarios: number; encontrados: number }>(`/rutas/${vendedorId}/renovar`, post()),

  prospectos: (vendedorId: string) => req<Prospecto[]>(`/prospectos/vendedor/${vendedorId}`),

  zonasRestringidas: () => req<ZonaRestringida[]>('/zonas-restringidas'),
  crearZonaRestringida: (data: ZonaRestringidaNueva) =>
    req<{ zona: ZonaRestringida; quitados: number }>('/zonas-restringidas', post(data)),
  // vendedorIds vacío = se borra la zona.
  editarZonaRestringida: (id: string, data: Partial<ZonaRestringidaNueva>) =>
    req<{ zona: ZonaRestringida | null; quitados: number }>(`/zonas-restringidas/${id}`, { method: 'PUT', body: JSON.stringify(data) }),

  tablero: (f: { vista: VistaTablero; fecha?: string; desde?: string; hasta?: string; productoIds?: string[]; vendedorIds?: string[] }) =>
    req<Tablero>(`/tablero${qs(f)}`),
  enVivo: (f: { productoIds?: string[]; vendedorIds?: string[] }) => req<{ hoy: string; items: EnVivoItem[] }>(`/seguimiento${qs(f)}`),
  mapaCalor: (f: Filtro) => req<MapaCalorResponse>(`/mapa/calor${qs({ ...f })}`),
  recorridos: (f: Filtro) => req<RecorridoVendedor[]>(`/ubicaciones/recorrido${qs({ ...f })}`),

  visitas: (params: Filtro & { resultados?: string[]; origenes?: string[]; alertas?: string[]; cursor?: string; limit?: number }) =>
    req<VisitasResponse>(`/visitas${qs({
      vendedorIds: params.vendedorIds, productoIds: params.productoIds, resultados: params.resultados, origenes: params.origenes, alertas: params.alertas,
      desde: params.desde, hasta: params.hasta, cursor: params.cursor, limit: params.limit ? String(params.limit) : undefined,
    })}`),
  llamadas: (params: Filtro & { resultados?: string[] }) =>
    req<{ items: Llamada[]; truncado: boolean }>(`/llamadas${qs({
      vendedorIds: params.vendedorIds, productoIds: params.productoIds, resultados: params.resultados, desde: params.desde, hasta: params.hasta,
    })}`),
  citas: (f: { productoIds?: string[]; vendedorIds?: string[] }) => req<CitaProxima[]>(`/llamadas/citas${qs(f)}`),
  crearVendedorPrueba: (data: { email: string; productoId: string; nombre?: string }) => req<{ id: string }>('/equipo/prueba', post(data)),
  borrarVendedorPrueba: (id: string) => req<{ borrados: Record<string, number> }>(`/equipo/prueba/${id}`, { method: 'DELETE' }),
  revisarUbicacion: (visitaId: string, accion: 'aceptar' | 'descartar') =>
    req<{ ok: boolean; negocios?: number }>(`/visitas/${visitaId}/ubicacion`, post({ accion })),
  config: () => req<{ radioCercoMetros: number; grabacionPorcentaje: number }>('/config'),
  guardarConfig: (data: { radioCercoMetros?: number; grabacionPorcentaje?: number }) =>
    req<{ radioCercoMetros: number; grabacionPorcentaje: number }>('/config', { method: 'PUT', body: JSON.stringify(data) }),

  usoResumen: (f: Filtro) => req<UsoResumen>(`/interacciones/resumen${qs({ ...f })}`),
  grabaciones: (f: Filtro) => req<{ items: Grabacion[]; truncado: boolean }>(`/grabaciones${qs({ ...f })}`),
  grabacion: (sesionId: string) => req<GrabacionDetalle>(`/grabaciones/${encodeURIComponent(sesionId)}`),
  fragmentoGrabacion: reqFragmento,
  borrarGrabacion: (sesionId: string) => req<void>(`/grabaciones/${encodeURIComponent(sesionId)}`, { method: 'DELETE' }),
  grabarVendedor: (vendedorId: string, dias: number) =>
    req<{ grabarHasta: string | null }>(`/grabaciones/vendedor/${vendedorId}`, { method: 'PUT', body: JSON.stringify({ dias }) }),
  historialNegocio: (negocioId: string) => req<HistorialNegocio>(`/visitas/negocio/${encodeURIComponent(negocioId)}`),
};

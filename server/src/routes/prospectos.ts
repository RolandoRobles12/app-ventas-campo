import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { parseCsvParam, toIso } from '../firestore-helpers.js';
import { requireAdmin, puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { negocioIdDe } from '../negocios.js';
import { visitasDeNegocio } from './visitas.js';

export const prospectosRouter = Router();

interface ProspectoDoc {
  vendedorId: string;
  // Ver negocios.ts. Prospectos viejos pueden no tenerlo (se calcula al vuelo).
  negocioId?: string;
  nombre: string;
  direccion: string;
  giro?: string | null;
  distanciaKm?: number | null;
  telefono?: string | null;
  origen: string;
  estado: string;
  lat?: number | null;
  lng?: number | null;
  // Día en que le toca la visita (YYYY-MM-DD, hora de México) y su número de
  // parada ese día — los pone el planeador de rutas (routes/rutas.ts).
  fechaPlan?: string | null;
  orden?: number | null;
  // Una visita con resultado "Se reagenda visita" lo devuelve a pendiente
  // con una fechaPlan nueva (ver POST /visitas).
  reagendado?: boolean;
  // Cita que el vendedor agendó por teléfono (ver routes/llamadas.ts): solo
  // vale mientras citaFecha === fechaPlan (si el negocio se movió de día, la
  // hora ya no aplica).
  citaFecha?: string | null;
  citaHora?: string | null;
  ultimaLlamada?: { resultado: string; en: Timestamp } | null;
  // El vendedor reportó que el número no es del negocio.
  telefonoInvalido?: boolean;
  visitadoEn?: Timestamp | null;
  // Ventana semanal del asistente de rutas anterior (antes de fechaPlan):
  // YYYY-MM-DD, ambos inclusive. Solo la traen prospectos viejos.
  semanaInicio?: string | null;
  semanaHasta?: string | null;
  createdAt: Timestamp;
}

function shape(id: string, p: ProspectoDoc) {
  return {
    id,
    vendedorId: p.vendedorId,
    negocioId: p.negocioId || negocioIdDe(p),
    nombre: p.nombre,
    direccion: p.direccion,
    giro: p.giro ?? null,
    distanciaKm: p.distanciaKm ?? null,
    telefono: p.telefono ?? null,
    origen: p.origen,
    estado: p.estado,
    lat: p.lat ?? null,
    lng: p.lng ?? null,
    fechaPlan: p.fechaPlan ?? null,
    orden: p.orden ?? null,
    reagendado: !!p.reagendado,
    citaFecha: p.citaFecha ?? null,
    citaHora: p.citaHora ?? null,
    ultimaLlamada: p.ultimaLlamada ? { resultado: p.ultimaLlamada.resultado, en: toIso(p.ultimaLlamada.en) } : null,
    telefonoInvalido: !!p.telefonoInvalido,
    visitadoEn: toIso(p.visitadoEn ?? null),
    semanaInicio: p.semanaInicio ?? null,
    semanaHasta: p.semanaHasta ?? null,
    createdAt: toIso(p.createdAt),
  };
}

// Pendientes primero; luego por día planeado (los viejos sin fecha, por su
// ventana semanal) y número de parada.
function porEstadoYPlan(a: ReturnType<typeof shape>, b: ReturnType<typeof shape>) {
  if (a.estado !== b.estado) return a.estado === 'por_visitar' ? -1 : 1;
  const fa = a.fechaPlan ?? a.semanaInicio ?? '';
  const fb = b.fechaPlan ?? b.semanaInicio ?? '';
  if (fa !== fb) return fa < fb ? -1 : 1;
  return (a.orden ?? a.distanciaKm ?? Infinity) - (b.orden ?? b.distanciaKm ?? Infinity);
}

const DIAS_VISITADOS_EN_LISTA = 7;

// Ruta de un vendedor (usada por la app del vendedor y por el planeador del
// admin): todo lo pendiente más lo visitado en la última semana — el
// historial completo crece sin límite y la app no lo necesita. Los leads
// traen datos de contacto: un vendedor solo puede ver los suyos.
prospectosRouter.get('/vendedor/:vendedorId', async (req, res) => {
  if (!(await puedeActuarComoVendedor(req.user!.email, req.params.vendedorId))) return vendedorAjeno(res);
  const base = db.collection('prospectos').where('vendedorId', '==', req.params.vendedorId);
  const [pendientes, visitados] = await Promise.all([
    base.where('estado', '==', 'por_visitar').get(),
    // Lo visitado es solo de referencia: si esta consulta falla (p. ej. el
    // índice todavía se está creando), la ruta pendiente se entrega igual.
    base.where('estado', '==', 'visitado')
      .where('visitadoEn', '>=', Timestamp.fromMillis(Date.now() - DIAS_VISITADOS_EN_LISTA * 86_400_000)).get()
      .catch((err) => {
        console.error('prospectos visitados recientes:', err?.message || err);
        return { docs: [] as FirebaseFirestore.QueryDocumentSnapshot[] };
      }),
  ]);
  res.json([...pendientes.docs, ...visitados.docs].map((d) => shape(d.id, d.data() as ProspectoDoc)).sort(porEstadoYPlan));
});

// "Visitado antes": las últimas visitas a cada negocio de la ruta del
// vendedor, de él o de cualquier otro vendedor (también de quien ya no está
// activo), para que llegue sabiendo qué pasó la última vez. Solo de negocios
// que están en su propia ruta, y solo lo necesario: fecha, resultado, nota y
// quién fue — sin fotos ni ubicación.
const MAX_ANTECEDENTES_POR_LLAMADA = 60;
const ANTECEDENTES_POR_NEGOCIO = 3;

prospectosRouter.get('/vendedor/:vendedorId/antecedentes', async (req, res) => {
  const { vendedorId } = req.params;
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);
  const ids = [...new Set(parseCsvParam((req.query as { ids?: string }).ids))]
    .filter((id) => /^[A-Za-z0-9_-]{1,64}$/.test(id))
    .slice(0, MAX_ANTECEDENTES_POR_LLAMADA);
  if (!ids.length) return res.json({});
  const docs = await db.getAll(...ids.map((id) => db.collection('prospectos').doc(id)));
  const propios = docs.filter((d) => d.exists && d.get('vendedorId') === vendedorId);

  const porProspecto = await Promise.all(propios.map(async (d) => [
    d.id,
    await visitasDeNegocio((d.get('negocioId') as string | undefined) || negocioIdDe(d.data() as ProspectoDoc), ANTECEDENTES_POR_NEGOCIO),
  ] as const));
  // Visitas de antes de guardar el nombre del vendedor en la visita.
  const sinNombre = [...new Set(porProspecto.flatMap(([, vs]) => vs.filter((v) => !v.vendedorNombre).map((v) => v.vendedorId)))];
  const nombres = new Map(sinNombre.length
    ? (await db.getAll(...sinNombre.map((id) => db.collection('vendedores').doc(id)))).map((v) => [v.id, v.get('nombre') as string | undefined])
    : []);
  res.json(Object.fromEntries(porProspecto.map(([id, visitas]) => [id, visitas.map((v) => ({
    fecha: toIso(v.createdAt),
    resultado: v.resultado,
    notas: v.notas ?? null,
    vendedorNombre: v.vendedorNombre || nombres.get(v.vendedorId) || '—',
    propia: v.vendedorId === vendedorId,
  }))])));
});

// Solo admin: quitar un negocio de la ruta de un vendedor.
prospectosRouter.delete('/:id', requireAdmin, async (req, res) => {
  await db.collection('prospectos').doc(req.params.id).delete().catch(() => null);
  res.status(204).end();
});

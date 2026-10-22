import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { resolveVendedorIds, getVendedoresDocs } from './_filters.js';
import { isEmptyRestriction, parseCsvParam, toIso } from '../firestore-helpers.js';
import { hoyMx, inicioDiaMx } from '../fechas.js';
import { productosPorId, type VendedorDoc } from './vendedores.js';

// "En vivo": cómo va hoy cada vendedor activo — dónde está, cuántas visitas
// lleva contra las que le tocan hoy y cuál fue la última. Incluye a quienes
// no han empezado, para que el admin vea de un vistazo quién falta.
export const seguimientoRouter = Router();

interface UbicacionDoc {
  lat: number;
  lng: number;
  createdAt: Timestamp;
}

interface VisitaDoc {
  nombreNegocio: string;
  resultado: string;
  createdAt: Timestamp;
}

// Sin una jornada que "iniciar" a mano, "en ruta" se infiere de actividad
// real: el vendedor manda un ping de ubicación cada 5 min mientras la app
// está abierta (apps/seller/src/ubicacion.tsx), así que un ping reciente equivale a
// "trabajando ahora mismo". La ventana es más ancha que el intervalo de
// ping para tolerar que se salte un ciclo (pantalla apagada, sin señal, etc).
const VENTANA_EN_RUTA_MIN = 20;

seguimientoRouter.get('/', async (req, res) => {
  const { productoIds, vendedorIds } = req.query as { productoIds?: string; vendedorIds?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  const hoy = hoyMx();
  if (isEmptyRestriction(ids)) return res.json({ hoy, items: [] });

  const vendedores = (await getVendedoresDocs(ids))
    .map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }))
    .filter((v) => v.estado !== 'Baja');
  const productos = await productosPorId(vendedores.map((v) => v.productoId));

  const inicioHoy = Timestamp.fromDate(inicioDiaMx(hoy));
  const umbralActivo = Date.now() - VENTANA_EN_RUTA_MIN * 60 * 1000;

  const items = await Promise.all(vendedores.map(async (v) => {
    const plan = db.collection('prospectos').where('vendedorId', '==', v.id).where('fechaPlan', '==', hoy);
    const [ubicacionSnap, visitasSnap, planHoy, planHoyVisitados] = await Promise.all([
      db.collection('ubicaciones').where('vendedorId', '==', v.id).orderBy('createdAt', 'desc').limit(1).get(),
      db.collection('visitas').where('vendedorId', '==', v.id).where('createdAt', '>=', inicioHoy)
        .select('nombreNegocio', 'resultado', 'createdAt').get(),
      plan.count().get(),
      plan.where('estado', '==', 'visitado').count().get(),
    ]);
    const ubicacion = ubicacionSnap.docs[0]?.data() as UbicacionDoc | undefined;
    const visitas = visitasSnap.docs.map((d) => d.data() as VisitaDoc).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
    const ultimaVisita = visitas[visitas.length - 1];
    const senal = ubicacion?.createdAt.toMillis() ?? 0;
    const actividadHoy = visitas.length > 0 || senal >= inicioHoy.toMillis();
    return {
      id: v.id, nombre: v.nombre, iniciales: v.iniciales, color: v.color,
      producto: productos.get(v.productoId) ?? '—', zona: v.rutaConfig?.zona.etiqueta || v.zona || v.ciudad || null,
      estado: senal >= umbralActivo ? 'en_ruta' : actividadHoy ? 'inactivo' : 'sin_actividad',
      ultimaSenal: ubicacion ? toIso(ubicacion.createdAt) : null,
      // La posición solo si es de hoy: la de ayer confunde en el mapa en vivo.
      posicion: ubicacion && senal >= inicioHoy.toMillis() ? { lat: ubicacion.lat, lng: ubicacion.lng } : null,
      visitasHoy: visitas.length,
      planHoy: planHoy.data().count,
      planHoyVisitados: planHoyVisitados.data().count,
      primeraVisita: visitas[0] ? toIso(visitas[0].createdAt) : null,
      ultimaVisita: ultimaVisita ? { nombre: ultimaVisita.nombreNegocio, resultado: ultimaVisita.resultado, hora: toIso(ultimaVisita.createdAt) } : null,
    };
  }));

  const rango = { en_ruta: 0, inactivo: 1, sin_actividad: 2 } as const;
  items.sort((a, b) => rango[a.estado as keyof typeof rango] - rango[b.estado as keyof typeof rango] || b.visitasHoy - a.visitasHoy || a.nombre.localeCompare(b.nombre));
  res.json({ hoy, items });
});

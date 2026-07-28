import { Router } from 'express';
import { AggregateField } from 'firebase-admin/firestore';
import { db, Timestamp, FieldPath } from '../db.js';
import { resolveVendedorIds } from './_filters.js';
import { isEmptyRestriction, parseCsvParam } from '../firestore-helpers.js';

export const seguimientoRouter = Router();

interface VendedorDoc {
  nombre: string;
  iniciales: string;
  color: string;
  productoId: string;
  ciudad: string;
}

interface UbicacionDoc {
  createdAt: Timestamp;
}

interface VisitaDoc {
  nombreNegocio: string;
}

// Sin una jornada que "iniciar" a mano, "en ruta" se infiere de actividad
// real: el vendedor manda un ping de ubicación cada 5 min mientras la app
// está abierta (LocationTracker), así que un ping reciente equivale a
// "trabajando ahora mismo". La ventana es más ancha que el intervalo de
// ping para tolerar que se salte un ciclo (pantalla apagada, sin señal, etc).
const VENTANA_EN_RUTA_MIN = 20;

seguimientoRouter.get('/', async (req, res) => {
  const { productoIds, vendedorIds } = req.query as { productoIds?: string; vendedorIds?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json([]);

  const vendedoresSnap = ids
    ? await db.collection('vendedores').where(FieldPath.documentId(), 'in', ids).get()
    : await db.collection('vendedores').get();
  const vendedores = vendedoresSnap.docs.map((d) => ({ id: d.id, ...(d.data() as VendedorDoc) }));

  const productos = new Map<string, string>();
  await Promise.all([...new Set(vendedores.map((v) => v.productoId))].map(async (pid) => {
    const doc = await db.collection('productos').doc(pid).get();
    if (doc.exists) productos.set(pid, (doc.data() as { nombre: string }).nombre);
  }));

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const umbralActivo = new Date(Date.now() - VENTANA_EN_RUTA_MIN * 60 * 1000);

  const out = await Promise.all(vendedores.map(async (v) => {
    const [realizadasSnap, primeraUbicacionHoySnap, ultimaUbicacionSnap, pendientesSnap, ultimaVisitaSnap, kmSnap] = await Promise.all([
      db.collection('visitas').where('vendedorId', '==', v.id)
        .where('createdAt', '>=', Timestamp.fromDate(start)).where('createdAt', '<', Timestamp.fromDate(end)).count().get(),
      db.collection('ubicaciones').where('vendedorId', '==', v.id)
        .where('createdAt', '>=', Timestamp.fromDate(start)).where('createdAt', '<', Timestamp.fromDate(end))
        .orderBy('createdAt', 'asc').limit(1).get(),
      db.collection('ubicaciones').where('vendedorId', '==', v.id).orderBy('createdAt', 'desc').limit(1).get(),
      db.collection('prospectos').where('vendedorId', '==', v.id).where('estado', '==', 'por_visitar').count().get(),
      db.collection('visitas').where('vendedorId', '==', v.id).orderBy('createdAt', 'desc').limit(1).get(),
      db.collection('prospectos').where('vendedorId', '==', v.id).where('estado', '==', 'visitado')
        .aggregate({ sum: AggregateField.sum('distanciaKm') }).get(),
    ]);

    const realizadas = realizadasSnap.data().count;
    const primeraUbicacionHoy = primeraUbicacionHoySnap.docs[0]?.data() as UbicacionDoc | undefined;
    if (realizadas === 0 && !primeraUbicacionHoy) return null; // sin actividad hoy: no aparece "en vivo"

    const ultimaUbicacion = ultimaUbicacionSnap.docs[0]?.data() as UbicacionDoc | undefined;
    const activo = !!ultimaUbicacion && ultimaUbicacion.createdAt.toDate() >= umbralActivo;

    const pendientes = pendientesSnap.data().count;
    const totalLista = realizadas + pendientes;
    const pct = totalLista > 0 ? Math.round((realizadas / totalLista) * 100) : 0;
    const ultimaVisita = ultimaVisitaSnap.docs[0]?.data() as VisitaDoc | undefined;
    const km = (kmSnap.data().sum as number | null) || 0;

    return {
      id: v.id, nombre: v.nombre, iniciales: v.iniciales, color: v.color, producto: productos.get(v.productoId), ciudad: v.ciudad,
      inicio: primeraUbicacionHoy
        ? primeraUbicacionHoy.createdAt.toDate().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })
        : null,
      estado: activo ? 'En ruta' : 'Inactivo',
      realizadas, pendientes, pct,
      km: Math.round(km * 10) / 10,
      ubicacionActual: ultimaVisita?.nombreNegocio || 'Sin registrar',
    };
  }));

  res.json(out.filter(Boolean));
});

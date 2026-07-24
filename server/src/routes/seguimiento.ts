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

interface JornadaDoc {
  activa: boolean;
  horaEntrada: string | null;
}

interface VisitaDoc {
  nombreNegocio: string;
}

seguimientoRouter.get('/', async (req, res) => {
  const { productoIds, vendedorIds } = req.query as { productoIds?: string; vendedorIds?: string };
  const ids = await resolveVendedorIds(parseCsvParam(vendedorIds), parseCsvParam(productoIds));
  if (isEmptyRestriction(ids)) return res.json([]);
  const fecha = new Date().toISOString().slice(0, 10);

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

  const out = await Promise.all(vendedores.map(async (v) => {
    const jornadaDoc = await db.collection('jornadas').doc(`${v.id}_${fecha}`).get();
    const jornada = jornadaDoc.data() as JornadaDoc | undefined;
    if (!jornada?.activa && !jornada?.horaEntrada) return null; // no ha trabajado hoy: no aparece "en vivo"

    const [realizadasSnap, pendientesSnap, ultimaVisitaSnap, kmSnap] = await Promise.all([
      db.collection('visitas').where('vendedorId', '==', v.id)
        .where('createdAt', '>=', Timestamp.fromDate(start)).where('createdAt', '<', Timestamp.fromDate(end)).count().get(),
      db.collection('prospectos').where('vendedorId', '==', v.id).where('estado', '==', 'por_visitar').count().get(),
      db.collection('visitas').where('vendedorId', '==', v.id).orderBy('createdAt', 'desc').limit(1).get(),
      db.collection('prospectos').where('vendedorId', '==', v.id).where('estado', '==', 'visitado')
        .aggregate({ sum: AggregateField.sum('distanciaKm') }).get(),
    ]);

    const realizadas = realizadasSnap.data().count;
    const pendientes = pendientesSnap.data().count;
    const totalLista = realizadas + pendientes;
    const pct = totalLista > 0 ? Math.round((realizadas / totalLista) * 100) : 0;
    const ultimaVisita = ultimaVisitaSnap.docs[0]?.data() as VisitaDoc | undefined;
    const km = (kmSnap.data().sum as number | null) || 0;

    return {
      id: v.id, nombre: v.nombre, iniciales: v.iniciales, color: v.color, producto: productos.get(v.productoId), ciudad: v.ciudad,
      inicio: jornada.horaEntrada, estado: jornada.activa ? 'En ruta' : 'Finalizó',
      realizadas, pendientes, pct,
      km: Math.round(km * 10) / 10,
      ubicacionActual: ultimaVisita?.nombreNegocio || 'Sin registrar',
    };
  }));

  res.json(out.filter(Boolean));
});

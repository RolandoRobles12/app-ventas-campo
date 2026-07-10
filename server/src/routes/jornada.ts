import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';

export const jornadaRouter = Router();

interface JornadaDoc {
  vendedorId: string;
  fecha: string;
  horaEntrada: string | null;
  horaSalidaComer: string | null;
  horaRegreso: string | null;
  horaSalida: string | null;
  activa: boolean;
  createdAt: Timestamp;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowHM(): string {
  return new Date().toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });
}

function jornadaId(vendedorId: string, fecha: string) {
  return `${vendedorId}_${fecha}`;
}

function shape(id: string, j: JornadaDoc) {
  return {
    id,
    vendedorId: j.vendedorId,
    fecha: j.fecha,
    horaEntrada: j.horaEntrada,
    horaSalidaComer: j.horaSalidaComer,
    horaRegreso: j.horaRegreso,
    horaSalida: j.horaSalida,
    activa: j.activa,
    createdAt: toIso(j.createdAt),
  };
}

async function getOrCreateHoy(vendedorId: string): Promise<{ id: string; data: JornadaDoc }> {
  const fecha = today();
  const ref = db.collection('jornadas').doc(jornadaId(vendedorId, fecha));
  const doc = await ref.get();
  if (doc.exists) return { id: doc.id, data: doc.data() as JornadaDoc };

  const data: JornadaDoc = {
    vendedorId, fecha, horaEntrada: null, horaSalidaComer: null, horaRegreso: null, horaSalida: null,
    activa: false, createdAt: Timestamp.now(),
  };
  await ref.set(data);
  return { id: ref.id, data };
}

async function visitasHoyCount(vendedorId: string): Promise<number> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const snap = await db.collection('visitas')
    .where('vendedorId', '==', vendedorId)
    .where('createdAt', '>=', Timestamp.fromDate(start))
    .count()
    .get();
  return snap.data().count;
}

// Racha real: días consecutivos (terminando hoy o ayer) en los que el vendedor
// registró al menos una visita.
async function calcularRacha(vendedorId: string): Promise<number> {
  const snap = await db.collection('jornadas')
    .where('vendedorId', '==', vendedorId)
    .orderBy('fecha', 'desc')
    .limit(60)
    .get();
  const dias = new Set(
    snap.docs
      .map((d) => d.data() as JornadaDoc)
      .filter((j) => j.horaEntrada)
      .map((j) => j.fecha),
  );
  let racha = 0;
  const cursor = new Date();
  cursor.setHours(0, 0, 0, 0);
  // si hoy aún no hay jornada, la racha se cuenta desde ayer
  if (!dias.has(cursor.toISOString().slice(0, 10))) cursor.setDate(cursor.getDate() - 1);
  while (dias.has(cursor.toISOString().slice(0, 10))) {
    racha++;
    cursor.setDate(cursor.getDate() - 1);
  }
  return racha;
}

jornadaRouter.get('/:vendedorId/hoy', async (req, res) => {
  const j = await getOrCreateHoy(req.params.vendedorId);
  const [visitasHoy, racha] = await Promise.all([
    visitasHoyCount(req.params.vendedorId),
    calcularRacha(req.params.vendedorId),
  ]);
  res.json({ ...shape(j.id, j.data), visitasHoy, racha });
});

jornadaRouter.post('/:vendedorId/toggle', async (req, res) => {
  const j = await getOrCreateHoy(req.params.vendedorId);
  const data: Partial<JornadaDoc> = { activa: !j.data.activa };
  if (!j.data.activa) {
    // iniciando jornada
    if (!j.data.horaEntrada) data.horaEntrada = nowHM();
  } else {
    // finalizando jornada
    data.horaSalida = nowHM();
  }
  const ref = db.collection('jornadas').doc(j.id);
  await ref.update(data);
  const updated = { ...j.data, ...data };
  const visitasHoy = await visitasHoyCount(req.params.vendedorId);
  res.json({ ...shape(j.id, updated), visitasHoy });
});

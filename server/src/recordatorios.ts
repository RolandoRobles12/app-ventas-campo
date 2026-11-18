import { getMessaging } from 'firebase-admin/messaging';
import { db, Timestamp } from './db.js';
import { MX_TZ, hoyMx } from './fechas.js';
import { COLECCION_TOKENS } from './routes/notificaciones.js';

// Recordatorios de citas por notificación (los manda una función programada
// cada 5 minutos, ver functions/src/index.ts):
//   - a las 9:00, el resumen de las citas del día (solo si tiene citas),
//   - 60 y 30 minutos antes de cada cita.
// Una cita es la que el vendedor agendó por teléfono (ver routes/llamadas.ts):
// vale mientras el negocio siga pendiente y citaFecha === fechaPlan.
// Cada aviso se marca en `recordatoriosEnviados` (con create(), que falla si
// ya existe): aunque dos corridas se encimen, nadie recibe el mismo dos veces.

const MINUTO_RESUMEN = 9 * 60;
// Pasado el mediodía ya no tiene caso mandar el resumen de la mañana.
const MINUTO_RESUMEN_LIMITE = 12 * 60;
const AVISOS_ANTES = [60, 30];

interface Cita { prospectoId: string; vendedorId: string; nombre: string; direccion: string; minuto: number; hora: string }

function minutoMx(ahora: Date): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: MX_TZ, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(ahora);
  return Number(p.find((x) => x.type === 'hour')!.value) * 60 + Number(p.find((x) => x.type === 'minute')!.value);
}

// "14:30" → "2:30 pm"
function textoHora(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}

// true si este aviso no se había mandado (y lo deja marcado).
async function marcar(id: string): Promise<boolean> {
  try {
    await db.collection('recordatoriosEnviados').doc(id).create({ en: Timestamp.now() });
    return true;
  } catch {
    return false;
  }
}

// Un error al mandar a un vendedor no detiene a los demás.
async function enviar(vendedorId: string, aviso: { titulo: string; texto: string; url: string; etiqueta: string }): Promise<number> {
  try {
    return await enviarATablets(vendedorId, aviso);
  } catch (err) {
    console.error(`Recordatorio a ${vendedorId} falló:`, err);
    return 0;
  }
}

async function enviarATablets(vendedorId: string, aviso: { titulo: string; texto: string; url: string; etiqueta: string }): Promise<number> {
  const snap = await db.collection(COLECCION_TOKENS).where('vendedorId', '==', vendedorId).get();
  if (snap.empty) return 0;
  const tokens = snap.docs.map((d) => d.get('token') as string);
  // Solo datos: el service worker de la app arma la notificación (así se ve
  // igual en la app instalada y en el navegador).
  const r = await getMessaging().sendEachForMulticast({
    tokens,
    data: { title: aviso.titulo, body: aviso.texto, url: aviso.url, tag: aviso.etiqueta },
    webpush: { headers: { Urgency: 'high', TTL: String(30 * 60) } },
  });
  // Tokens de tablets que ya no existen (se desinstaló o se borraron datos).
  const muertos = r.responses.flatMap((x, i) => (x.error && /registration-token-not-registered|invalid-registration-token|invalid-argument/.test(x.error.code) ? [snap.docs[i].ref] : []));
  await Promise.all(muertos.map((ref) => ref.delete()));
  return r.successCount;
}

export async function enviarRecordatorios(ahora = new Date()): Promise<{ resumenes: number; avisos: number }> {
  const hoy = hoyMx();
  const minuto = minutoMx(ahora);
  const snap = await db.collection('prospectos').where('citaFecha', '==', hoy).get();
  const citas: Cita[] = snap.docs.flatMap((d) => {
    const p = d.data();
    if (p.estado !== 'por_visitar' || p.fechaPlan !== hoy || typeof p.citaHora !== 'string' || !/^\d{2}:\d{2}$/.test(p.citaHora)) return [];
    const [h, m] = (p.citaHora as string).split(':').map(Number);
    return [{ prospectoId: d.id, vendedorId: p.vendedorId, nombre: p.nombre, direccion: p.direccion || '', minuto: h * 60 + m, hora: p.citaHora }];
  });

  let resumenes = 0;
  let avisos = 0;

  if (minuto >= MINUTO_RESUMEN && minuto < MINUTO_RESUMEN_LIMITE) {
    const porVendedor = new Map<string, Cita[]>();
    for (const c of citas) porVendedor.set(c.vendedorId, [...(porVendedor.get(c.vendedorId) ?? []), c]);
    for (const [vendedorId, lista] of porVendedor) {
      if (!(await marcar(`${hoy}_${vendedorId}_resumen`))) continue;
      lista.sort((a, b) => a.minuto - b.minuto);
      const n = lista.length;
      await enviar(vendedorId, {
        titulo: n === 1 ? 'Hoy tienes 1 cita' : `Hoy tienes ${n} citas`,
        texto: lista.map((c) => `${c.nombre} · ${textoHora(c.hora)}`).join('\n'),
        url: '/', etiqueta: `resumen-${hoy}`,
      });
      resumenes++;
    }
  }

  for (const c of citas) {
    const faltan = c.minuto - minuto;
    if (faltan <= 0) continue;
    // El aviso más cercano que ya tocó (si la cita se agendó tarde, solo el
    // de 30 min; nunca los dos a la vez).
    const aviso = AVISOS_ANTES.filter((a) => faltan <= a).sort((a, b) => a - b)[0];
    if (aviso == null) continue;
    if (!(await marcar(`${hoy}_${c.prospectoId}_${aviso}`))) continue;
    if (aviso === 30) await marcar(`${hoy}_${c.prospectoId}_60`);
    await enviar(c.vendedorId, {
      titulo: `Tu cita es en ${faltan} min`,
      texto: `${c.nombre} · ${textoHora(c.hora)}${c.direccion ? `\n${c.direccion}` : ''}`,
      url: `/llegar/${c.prospectoId}`, etiqueta: `cita-${c.prospectoId}`,
    });
    avisos++;
  }
  return { resumenes, avisos };
}

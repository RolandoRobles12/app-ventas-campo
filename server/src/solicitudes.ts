import { db, Timestamp } from './db.js';
import { inicioDiaMx, fechaMx } from './fechas.js';
import {
  dealsPorId, hubspotConfigurado, ownersPorEmail, PIPELINE_CAMPO, solicitudesDeOwner, type SolicitudHubspot,
} from './integrations/hubspot.js';

// Atribución de solicitudes: al registrar "Hizo solicitud", el vendedor
// elige cuál de sus solicitudes de HubSpot es la de ese negocio.
//
// Si todavía no aparece (HubSpot a veces tarda, o no hay señal), la visita
// queda "sin ligar" (`solicitudPendiente`) y se resuelve después por dos
// caminos, el que llegue primero:
//   - el vendedor la liga desde "Mi ruta", donde se le recuerda;
//   - cada 15 min, ligarPendientes() la liga sola con la solicitud de él que
//     se creó más cerca de la hora de la visita (vinculo: 'auto').
// Una solicitud solo puede estar ligada a una visita (colección
// `solicitudesLigadas`, id = id del deal).

export const SOLICITUD = 'Se realizó solicitud';
const LIGADAS = 'solicitudesLigadas';
// Hasta cuándo se sigue intentando ligar sola una visita pendiente.
const DIAS_PENDIENTE = 3;
// Ventana para ligar sola: desde 30 min antes de la visita (la solicitud se
// pudo capturar antes de guardar la visita) hasta 12 h después.
const ANTES_MS = 30 * 60_000;
const DESPUES_MS = 12 * 3600_000;

export type Vinculo = 'vendedor' | 'auto' | 'admin';
export type EstadoLista = 'ok' | 'sin_configurar' | 'sin_cuenta' | 'error';

export interface Opcion { id: string; nombre: string; creado: number; ligadaA: { visitaId: string; nombreNegocio: string } | null }

export async function ownerDeVendedor(vendedorId: string): Promise<string | null> {
  const email = (await db.collection('vendedores').doc(vendedorId).get()).get('email') as string | undefined;
  if (!email) return null;
  return (await ownersPorEmail()).get(email.trim().toLowerCase()) ?? null;
}

async function ligadasDe(ids: string[]): Promise<Map<string, { visitaId: string; nombreNegocio: string }>> {
  if (!ids.length) return new Map();
  const docs = await db.getAll(...ids.map((id) => db.collection(LIGADAS).doc(id)));
  return new Map(docs.filter((d) => d.exists).map((d) => [d.id, { visitaId: d.get('visitaId') as string, nombreNegocio: (d.get('nombreNegocio') as string) || '' }]));
}

// Las solicitudes que el vendedor puede elegir: las suyas del día de la
// visita (o de hoy) hasta ahora, la más reciente primero, diciendo cuáles
// ya están ligadas a otra visita.
export async function opcionesParaLigar(vendedorId: string, desde: number, fresco: boolean): Promise<{ estado: EstadoLista; items: Opcion[] }> {
  if (!hubspotConfigurado()) return { estado: 'sin_configurar', items: [] };
  try {
    const owner = await ownerDeVendedor(vendedorId);
    if (!owner) return { estado: 'sin_cuenta', items: [] };
    const lista = await solicitudesDeOwner(owner, desde, Date.now() + 60_000, fresco);
    const ligadas = await ligadasDe(lista.map((s) => s.id));
    return { estado: 'ok', items: lista.map((s) => ({ id: s.id, nombre: s.nombre, creado: s.creado, ligadaA: ligadas.get(s.id) ?? null })) };
  } catch (err) {
    console.error('Solicitudes para ligar:', err);
    return { estado: 'error', items: [] };
  }
}

export const inicioDelDiaDe = (ms: number) => inicioDiaMx(fechaMx(new Date(ms))).getTime();

export type ResultadoLigar = { ok: true; nombre: string } | { ok: false; motivo: 'ocupada' | 'no_es_suya' | 'no_encontrada' | 'error' };

// Liga una visita con una solicitud. `verificada`: ya se sabe que el deal es
// del vendedor (ligarPendientes la trae de su propia búsqueda).
export async function ligar(visitaId: string, dealId: string, vinculo: Vinculo, verificada?: SolicitudHubspot): Promise<ResultadoLigar> {
  const visitaRef = db.collection('visitas').doc(visitaId);
  const visita = (await visitaRef.get()).data();
  if (!visita) return { ok: false, motivo: 'no_encontrada' };
  let nombre = verificada?.nombre;
  if (!verificada) {
    try {
      const [deal] = await dealsPorId([dealId]);
      if (!deal) return { ok: false, motivo: 'no_encontrada' };
      const owner = await ownerDeVendedor(visita.vendedorId);
      if (!owner || deal.ownerId !== owner || (deal.pipeline && deal.pipeline !== PIPELINE_CAMPO)) return { ok: false, motivo: 'no_es_suya' };
      nombre = deal.nombre;
    } catch (err) {
      console.error('Verificar solicitud:', err);
      return { ok: false, motivo: 'error' };
    }
  }
  try {
    await db.runTransaction(async (tx) => {
      const ligaRef = db.collection(LIGADAS).doc(dealId);
      const liga = await tx.get(ligaRef);
      if (liga.exists && liga.get('visitaId') !== visitaId) throw new Error('OCUPADA');
      const anterior = visita.dealId as string | undefined;
      if (anterior && anterior !== dealId) tx.delete(db.collection(LIGADAS).doc(anterior));
      tx.set(ligaRef, { visitaId, vendedorId: visita.vendedorId, nombreNegocio: visita.nombreNegocio ?? '', vinculo, en: Timestamp.now() });
      tx.update(visitaRef, { dealId, dealNombre: nombre ?? null, solicitudPendiente: false, vinculoSolicitud: vinculo });
    });
  } catch (err) {
    if ((err as Error).message === 'OCUPADA') return { ok: false, motivo: 'ocupada' };
    throw err;
  }
  return { ok: true, nombre: nombre ?? '' };
}

// Liga sola las visitas "Hizo solicitud" que quedaron sin ligar: por
// vendedor, empareja cada visita con la solicitud libre que se creó más
// cerca de su hora (dentro de la ventana), sin repetir ninguna.
export async function ligarPendientes(ahora = Date.now()): Promise<{ ligadas: number; pendientes: number }> {
  if (!hubspotConfigurado()) return { ligadas: 0, pendientes: 0 };
  const limite = ahora - DIAS_PENDIENTE * 86_400_000;
  const snap = await db.collection('visitas').where('solicitudPendiente', '==', true).get();
  const pendientes = snap.docs.filter((d) => (d.get('createdAt') as Timestamp).toMillis() >= limite);
  const porVendedor = new Map<string, typeof pendientes>();
  for (const d of pendientes) porVendedor.set(d.get('vendedorId'), [...(porVendedor.get(d.get('vendedorId')) ?? []), d]);

  let ligadas = 0;
  for (const [vendedorId, visitas] of porVendedor) {
    try {
      const owner = await ownerDeVendedor(vendedorId);
      if (!owner) continue;
      const desde = Math.min(...visitas.map((v) => (v.get('createdAt') as Timestamp).toMillis())) - ANTES_MS;
      const deals = await solicitudesDeOwner(owner, desde, ahora + 60_000, true);
      const ocupadas = await ligadasDe(deals.map((x) => x.id));
      const libres = deals.filter((x) => !ocupadas.has(x.id));
      const parejas: { visita: string; deal: SolicitudHubspot; delta: number }[] = [];
      for (const v of visitas) {
        const t = (v.get('createdAt') as Timestamp).toMillis();
        for (const deal of libres) {
          if (deal.creado >= t - ANTES_MS && deal.creado <= t + DESPUES_MS) parejas.push({ visita: v.id, deal, delta: Math.abs(deal.creado - t) });
        }
      }
      parejas.sort((a, b) => a.delta - b.delta);
      const usadas = new Set<string>();
      const hechas = new Set<string>();
      for (const p of parejas) {
        if (hechas.has(p.visita) || usadas.has(p.deal.id)) continue;
        const r = await ligar(p.visita, p.deal.id, 'auto', p.deal);
        usadas.add(p.deal.id);
        if (r.ok) { hechas.add(p.visita); ligadas++; }
      }
    } catch (err) {
      console.error(`Ligar solicitudes de ${vendedorId}:`, err);
    }
  }
  return { ligadas, pendientes: pendientes.length - ligadas };
}

// Visitas "Hizo solicitud" de un vendedor que siguen sin ligar (para
// recordárselo en "Mi ruta").
export async function sinLigarDe(vendedorId: string, ahora = Date.now()) {
  const snap = await db.collection('visitas').where('vendedorId', '==', vendedorId).where('solicitudPendiente', '==', true).get();
  return snap.docs
    .filter((d) => (d.get('createdAt') as Timestamp).toMillis() >= ahora - DIAS_PENDIENTE * 86_400_000)
    .map((d) => ({ visitaId: d.id, nombreNegocio: d.get('nombreNegocio') as string, createdAt: (d.get('createdAt') as Timestamp).toDate().toISOString() }))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

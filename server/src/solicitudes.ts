import { db, Timestamp } from './db.js';
import { inicioDiaMx, fechaMx } from './fechas.js';
import {
  dealsPorId, hubspotConfigurado, ownersPorEmail, PIPELINE_CAMPO, solicitudesDeOwner, solicitudesDeOwners, type SolicitudHubspot,
} from './integrations/hubspot.js';
import { hoyMx, sumarDias } from './fechas.js';

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
//
// Tipificación incorrecta, en los dos sentidos:
//   - Marcó "Hizo solicitud" y no la hubo: desde "Mi ruta" corrige el
//     resultado (corregirResultado).
//   - Hizo la solicitud pero marcó otra cosa: la solicitud queda sin visita.
//     actualizarSinVisita() las encuentra y "Mi ruta" le pregunta de qué
//     visita es; al elegirla, la visita pasa a "Hizo solicitud" y se liga.
//     Si no fue en una visita, la descarta (queda ligada a ninguna).
// En los dos casos se guarda el resultado original (tipificacionCorregida).

export const SOLICITUD = 'Se realizó solicitud';
const LIGADAS = 'solicitudesLigadas';
// Hasta cuándo se sigue intentando ligar sola una visita pendiente.
const DIAS_PENDIENTE = 3;
// Ventana para ligar sola: desde 30 min antes de la visita (la solicitud se
// pudo capturar antes de guardar la visita) hasta 12 h después.
const ANTES_MS = 30 * 60_000;
const DESPUES_MS = 12 * 3600_000;
const REAGENDA = 'Se reagenda visita';
// Resultados a los que se puede corregir un "Hizo solicitud" que no lo fue.
export const CORRECCIONES = ['Se dejó información', 'Cliente no interesado', 'No es un negocio válido o existente'];
// Una solicitud recién creada todavía puede ligarse al registrar la visita:
// no se pregunta por ella hasta que pasa este tiempo.
const GRACIA_SIN_VISITA_MS = 20 * 60_000;
const SIN_VISITA = 'solicitudesSinVisita';

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
  // Las descartadas como "no fue en una visita" siguen libres para ligarse.
  return new Map(docs.filter((d) => d.exists && d.get('visitaId')).map((d) => [d.id, { visitaId: d.get('visitaId') as string, nombreNegocio: (d.get('nombreNegocio') as string) || '' }]));
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

export type ResultadoLigar = { ok: true; nombre: string } | { ok: false; motivo: 'ocupada' | 'no_es_suya' | 'no_encontrada' | 'error' | 'no_corregible' };

// Liga una visita con una solicitud. `verificada`: ya se sabe que el deal es
// del vendedor (ligarPendientes la trae de su propia búsqueda).
// `corregir`: la visita se tipificó con otro resultado; pasa a "Hizo
// solicitud" (guardando el original).
export async function ligar(visitaId: string, dealId: string, vinculo: Vinculo, verificada?: SolicitudHubspot, corregir = false): Promise<ResultadoLigar> {
  const visitaRef = db.collection('visitas').doc(visitaId);
  const visita = (await visitaRef.get()).data();
  if (!visita) return { ok: false, motivo: 'no_encontrada' };
  const cambiaResultado = visita.resultado !== SOLICITUD;
  // "Volver otro día" movió el negocio en su ruta: no se cambia por aquí.
  if (cambiaResultado && (!corregir || visita.resultado === REAGENDA)) return { ok: false, motivo: 'no_corregible' };
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
      if (liga.exists && liga.get('visitaId') && liga.get('visitaId') !== visitaId) throw new Error('OCUPADA');
      const anterior = visita.dealId as string | undefined;
      if (anterior && anterior !== dealId) tx.delete(db.collection(LIGADAS).doc(anterior));
      tx.set(ligaRef, { visitaId, vendedorId: visita.vendedorId, nombreNegocio: visita.nombreNegocio ?? '', vinculo, en: Timestamp.now() });
      tx.update(visitaRef, {
        dealId, dealNombre: nombre ?? null, solicitudPendiente: false, vinculoSolicitud: vinculo,
        ...(cambiaResultado ? { resultado: SOLICITUD, resultadoOriginal: visita.resultado, tipificacionCorregida: true } : {}),
      });
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

// "Hizo solicitud" que no lo fue: la visita (aún sin ligar) pasa al
// resultado correcto. Guarda el original.
export async function corregirResultado(visitaId: string, resultado: string): Promise<boolean> {
  if (!CORRECCIONES.includes(resultado)) return false;
  const ref = db.collection('visitas').doc(visitaId);
  return db.runTransaction(async (tx) => {
    const v = (await tx.get(ref)).data();
    if (!v || v.resultado !== SOLICITUD || v.dealId) return false;
    tx.update(ref, { resultado, resultadoOriginal: SOLICITUD, tipificacionCorregida: true, solicitudPendiente: false });
    return true;
  });
}

// "No fue en una visita": la solicitud deja de preguntarse (queda ligada a
// ninguna visita; todavía se puede ligar a una si se equivocó).
export async function descartarSinVisita(vendedorId: string, dealId: string): Promise<void> {
  await db.collection(LIGADAS).doc(dealId).create({ visitaId: null, vendedorId, sinVisita: true, vinculo: 'vendedor', en: Timestamp.now() })
    .catch(() => undefined);
}

// Solicitudes de ayer y hoy de cada vendedor activo que no están ligadas a
// ninguna visita. Se guardan por vendedor para que "Mi ruta" pregunte de
// qué visita son sin consultar HubSpot en cada carga.
export async function actualizarSinVisita(ahora = Date.now()): Promise<{ vendedores: number; solicitudes: number }> {
  if (!hubspotConfigurado()) return { vendedores: 0, solicitudes: 0 };
  const [vendedores, owners, previos] = await Promise.all([
    db.collection('vendedores').select('email', 'estado').get(),
    ownersPorEmail(),
    db.collection(SIN_VISITA).select().get(),
  ]);
  const vendedorDeOwner = new Map<string, string>();
  for (const d of vendedores.docs) {
    const email = (d.get('email') as string | undefined)?.trim().toLowerCase();
    const owner = email ? owners.get(email) : undefined;
    if (owner && d.get('estado') !== 'Baja') vendedorDeOwner.set(owner, d.id);
  }
  const desde = inicioDiaMx(sumarDias(hoyMx(), -1)).getTime();
  const deals = (await solicitudesDeOwners([...vendedorDeOwner.keys()], desde, ahora + 60_000))
    .filter((d) => d.creado <= ahora - GRACIA_SIN_VISITA_MS);
  const ligadas = new Set((await Promise.all(chunk(deals.map((d) => d.id), 100).map((ids) => db.getAll(...ids.map((id) => db.collection(LIGADAS).doc(id))))))
    .flat().filter((d) => d.exists).map((d) => d.id));
  const porVendedor = new Map<string, { dealId: string; nombre: string; creado: number }[]>();
  for (const d of deals) {
    const v = d.ownerId ? vendedorDeOwner.get(d.ownerId) : undefined;
    if (!v || ligadas.has(d.id)) continue;
    porVendedor.set(v, [...(porVendedor.get(v) ?? []), { dealId: d.id, nombre: d.nombre, creado: d.creado }]);
  }
  const batch = db.batch();
  for (const [v, items] of porVendedor) batch.set(db.collection(SIN_VISITA).doc(v), { items, en: Timestamp.now() });
  for (const d of previos.docs) if (!porVendedor.has(d.id)) batch.delete(d.ref);
  await batch.commit();
  return { vendedores: porVendedor.size, solicitudes: [...porVendedor.values()].reduce((n, l) => n + l.length, 0) };
}

const chunk = <T>(l: T[], n: number) => Array.from({ length: Math.ceil(l.length / n) }, (_, i) => l.slice(i * n, i * n + n));

// Las de un vendedor, sin las que ya se ligaron desde la última corrida.
export async function sinVisitaDe(vendedorId: string): Promise<{ dealId: string; nombre: string; creado: number }[]> {
  const items = ((await db.collection(SIN_VISITA).doc(vendedorId).get()).get('items') ?? []) as { dealId: string; nombre: string; creado: number }[];
  if (!items.length) return [];
  const ligadas = await db.getAll(...items.map((i) => db.collection(LIGADAS).doc(i.dealId)));
  return items.filter((_, i) => !ligadas[i].exists);
}

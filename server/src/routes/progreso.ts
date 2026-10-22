import { Router } from 'express';
import { db, Timestamp } from '../db.js';
import { toIso } from '../firestore-helpers.js';
import { puedeActuarComoVendedor, vendedorAjeno } from '../auth.js';
import { diaSemana, fechaMx, hoyMx, inicioDiaMx, sumarDias } from '../fechas.js';
import { DIAS_POR_DEFECTO } from '../rutas/planificador.js';
import type { VendedorDoc } from './vendedores.js';

// Avance del vendedor para su app: visitas de hoy, racha y lo que registró
// en los últimos días (pantalla "Historial"). Todo sale de sus visitas
// registradas — ya no de solicitudes/ventas de HubSpot.
export const progresoRouter = Router();

const DIAS_HISTORIAL = 14;
const MAX_RACHA = 120;

interface VisitaDoc {
  prospectoId: string | null;
  nombreNegocio: string;
  direccion: string;
  resultado: string;
  notas: string | null;
  fotos?: string[];
  esNegocioNuevo?: boolean;
  ubicacionValida?: boolean | null;
  createdAt: Timestamp;
}

const visitasDelDia = (vendedorId: string, fecha: string) => db.collection('visitas')
  .where('vendedorId', '==', vendedorId)
  .where('createdAt', '>=', Timestamp.fromDate(inicioDiaMx(fecha)))
  .where('createdAt', '<', Timestamp.fromDate(inicioDiaMx(sumarDias(fecha, 1))));

// Días de trabajo seguidos con al menos una visita, terminando hoy (o en el
// último día de trabajo, si hoy todavía no registra nada). Los días de
// descanso de su ruta (el domingo, por defecto) no rompen la racha.
async function calcularRacha(vendedorId: string, porDia: Map<string, number>, dias: number[], hoy: string): Promise<number> {
  const desdeHistorial = sumarDias(hoy, -(DIAS_HISTORIAL - 1));
  const conocidos = new Map(porDia);
  // Antes del historial ya leído se cuenta por bloques de días en paralelo
  // (un read por día, en vez de leer cada visita de una racha larga).
  const tieneVisitas = async (fecha: string) => {
    if (fecha < desdeHistorial && !conocidos.has(fecha)) {
      const bloque = Array.from({ length: DIAS_HISTORIAL }, (_, i) => sumarDias(fecha, -i));
      const conteos = await Promise.all(bloque.map((f) => visitasDelDia(vendedorId, f).count().get()));
      bloque.forEach((f, i) => conocidos.set(f, conteos[i].data().count));
    }
    return (conocidos.get(fecha) ?? 0) > 0;
  };

  let racha = 0;
  let fecha = hoy;
  if (!(await tieneVisitas(hoy))) fecha = sumarDias(hoy, -1);
  for (let i = 0; i < MAX_RACHA; i++, fecha = sumarDias(fecha, -1)) {
    const hubo = await tieneVisitas(fecha);
    // Trabajar en un día de descanso suma; no hacerlo no rompe la racha.
    if (hubo) racha++;
    else if (dias.includes(diaSemana(fecha))) break;
  }
  return racha;
}

progresoRouter.get('/:vendedorId', async (req, res) => {
  const vendedorId = req.params.vendedorId;
  if (!(await puedeActuarComoVendedor(req.user!.email, vendedorId))) return vendedorAjeno(res);

  const hoy = hoyMx();
  const [vendedorDoc, snap] = await Promise.all([
    db.collection('vendedores').doc(vendedorId).get(),
    db.collection('visitas')
      .where('vendedorId', '==', vendedorId)
      .where('createdAt', '>=', Timestamp.fromDate(inicioDiaMx(sumarDias(hoy, -(DIAS_HISTORIAL - 1)))))
      .get(),
  ]);
  const vendedor = vendedorDoc.data() as VendedorDoc | undefined;

  const visitas = snap.docs
    .map((d) => ({ id: d.id, ...(d.data() as VisitaDoc) }))
    .sort((a, b) => b.createdAt.toMillis() - a.createdAt.toMillis());
  const porDia = new Map<string, number>();
  for (const v of visitas) {
    const f = fechaMx(v.createdAt.toDate());
    porDia.set(f, (porDia.get(f) ?? 0) + 1);
  }

  const racha = await calcularRacha(vendedorId, porDia, vendedor?.rutaConfig?.dias ?? DIAS_POR_DEFECTO, hoy);

  res.json({
    hoy,
    visitasHoy: porDia.get(hoy) ?? 0,
    visitasPorDia: vendedor?.rutaConfig?.visitasPorDia ?? null,
    racha,
    semana: Array.from({ length: 7 }, (_, i) => {
      const fecha = sumarDias(hoy, i - 6);
      return { fecha, visitas: porDia.get(fecha) ?? 0 };
    }),
    recientes: visitas.slice(0, 120).map((v) => ({
      id: v.id,
      prospectoId: v.prospectoId,
      nombreNegocio: v.nombreNegocio,
      direccion: v.direccion,
      resultado: v.resultado,
      notas: v.notas,
      fotos: (v.fotos ?? []).length,
      esNegocioNuevo: !!v.esNegocioNuevo,
      ubicacionValida: v.ubicacionValida ?? null,
      createdAt: toIso(v.createdAt),
    })),
  });
});

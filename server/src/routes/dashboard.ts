import { Router } from 'express';
import { prisma } from '../db.js';
import { resolveVendedorIds } from './_filters.js';

export const dashboardRouter = Router();

const RESULTADOS = ['Se realizó solicitud', 'Se dejó información', 'Cliente no interesado', 'No es un negocio válido o existente', 'Se reagenda visita'];
const RESULTADO_COLOR: Record<string, string> = {
  'Se realizó solicitud': '#22a36c',
  'Se dejó información': '#ef8b3e',
  'Cliente no interesado': '#d64545',
  'No es un negocio válido o existente': '#b8c2ba',
  'Se reagenda visita': '#2a6fdb',
};

dashboardRouter.get('/summary', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  const vendedorWhere = ids ? { vendedorId: { in: ids } } : {};

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const yStart = new Date(start); yStart.setDate(yStart.getDate() - 1);

  const [visitasHoy, visitasAyer, porVisitar, totalVisitas, solicitudes, vendedoresTotal, vendedoresActivos] = await Promise.all([
    prisma.visita.count({ where: { ...vendedorWhere, createdAt: { gte: start, lt: end } } }),
    prisma.visita.count({ where: { ...vendedorWhere, createdAt: { gte: yStart, lt: start } } }),
    prisma.prospecto.count({ where: { ...vendedorWhere, estado: 'por_visitar' } }),
    prisma.visita.count({ where: vendedorWhere }),
    prisma.visita.count({ where: { ...vendedorWhere, resultado: 'Se realizó solicitud' } }),
    prisma.vendedor.count({ where: ids ? { id: { in: ids } } : {} }),
    prisma.vendedor.count({ where: { ...(ids ? { id: { in: ids } } : {}), estado: 'Activo' } }),
  ]);

  const conversion = totalVisitas > 0 ? Math.round((solicitudes / totalVisitas) * 100) : 0;
  const vsAyerPct = visitasAyer > 0 ? Math.round(((visitasHoy - visitasAyer) / visitasAyer) * 100) : null;

  res.json({
    visitasHoy, visitasAyerPct: vsAyerPct, porVisitar, conversion, vendedoresTotal, vendedoresActivos,
  });
});

dashboardRouter.get('/semana', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  const vendedorWhere = ids ? { vendedorId: { in: ids } } : {};

  const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const out: { day: string; val: number }[] = [];
  for (let i = 6; i >= 0; i--) {
    const start = new Date(); start.setHours(0, 0, 0, 0); start.setDate(start.getDate() - i);
    const end = new Date(start); end.setDate(end.getDate() + 1);
    const val = await prisma.visita.count({ where: { ...vendedorWhere, createdAt: { gte: start, lt: end } } });
    out.push({ day: days[start.getDay()], val });
  }
  res.json(out);
});

dashboardRouter.get('/resultados', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  const vendedorWhere = ids ? { vendedorId: { in: ids } } : {};

  const counts = await Promise.all(RESULTADOS.map((r) => prisma.visita.count({ where: { ...vendedorWhere, resultado: r } })));
  const total = counts.reduce((a, b) => a + b, 0);
  res.json({
    total,
    items: RESULTADOS.map((r, i) => ({ resultado: r, count: counts[i], pct: total > 0 ? Math.round((counts[i] / total) * 100) : 0, color: RESULTADO_COLOR[r] })),
  });
});

dashboardRouter.get('/actividad', async (req, res) => {
  const { producto, vendedor } = req.query as { producto?: string; vendedor?: string };
  const ids = await resolveVendedorIds(producto, vendedor);
  const vendedores = await prisma.vendedor.findMany({
    where: ids ? { id: { in: ids } } : {}, include: { producto: true }, orderBy: { nombre: 'asc' },
  });

  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const fecha = start.toISOString().slice(0, 10);

  const out = await Promise.all(vendedores.map(async (v) => {
    const [hoy, jornada] = await Promise.all([
      prisma.visita.count({ where: { vendedorId: v.id, createdAt: { gte: start, lt: end } } }),
      prisma.jornada.findUnique({ where: { vendedorId_fecha: { vendedorId: v.id, fecha } } }),
    ]);
    return {
      id: v.id, nombre: v.nombre, iniciales: v.iniciales, color: v.color, producto: v.producto.nombre, ciudad: v.ciudad,
      hoy, estado: jornada?.activa ? 'En ruta' : v.estado === 'Pausado' ? 'Pausado' : 'Sin iniciar',
    };
  }));
  res.json(out);
});

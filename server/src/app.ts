import express from 'express';
// Debe importarse antes de crear cualquier Router: parchea Express para que
// un handler async que rechaza (p.ej. una query de Firestore sin índice)
// llegue al middleware de errores de abajo en vez de quedar como una
// promesa sin capturar que tumba TODO el proceso (Node la trata como
// excepción fatal) — antes de esto, un solo request con error apagaba el
// servidor completo para todos los usuarios, no solo devolvía un 500.
import 'express-async-errors';
import cors from 'cors';
import path from 'node:path';

import { requireAuth } from './auth.js';
import { authRouter } from './routes/auth.js';
import { productosRouter } from './routes/productos.js';
import { vendedoresRouter } from './routes/vendedores.js';
import { prospectosRouter } from './routes/prospectos.js';
import { visitasRouter } from './routes/visitas.js';
import { jornadaRouter } from './routes/jornada.js';
import { metasRouter } from './routes/metas.js';
import { denueRouter } from './routes/denue.js';
import { crmRouter } from './routes/crm.js';
import { dashboardRouter } from './routes/dashboard.js';
import { mapaRouter } from './routes/mapa.js';
import { seguimientoRouter } from './routes/seguimiento.js';
import { reportesRouter } from './routes/reportes.js';

export const app = express();
const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', requireAuth);

app.use('/api/auth', authRouter);
app.use('/api/productos', productosRouter);
app.use('/api/vendedores', vendedoresRouter);
app.use('/api/prospectos', prospectosRouter);
app.use('/api/visitas', visitasRouter);
app.use('/api/jornada', jornadaRouter);
app.use('/api/metas', metasRouter);
app.use('/api/denue', denueRouter);
app.use('/api/crm', crmRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/mapa', mapaRouter);
app.use('/api/seguimiento', seguimientoRouter);
app.use('/api/reportes', reportesRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: err?.message });
});

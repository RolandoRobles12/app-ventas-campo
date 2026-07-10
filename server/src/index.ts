import express from 'express';
import cors from 'cors';
import path from 'node:path';

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

const app = express();
const PORT = process.env.PORT ? Number(process.env.PORT) : 4000;
const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json());
app.use('/uploads', express.static(path.resolve(process.cwd(), 'uploads')));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

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

app.listen(PORT, () => {
  console.log(`API lista en http://localhost:${PORT}`);
});

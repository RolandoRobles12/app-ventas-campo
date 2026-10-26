import express from 'express';
// Debe importarse antes de crear cualquier Router: parchea Express para que
// un handler async que rechaza (p.ej. una query de Firestore sin índice)
// llegue al middleware de errores de abajo en vez de quedar como una
// promesa sin capturar que tumba TODO el proceso (Node la trata como
// excepción fatal) — antes de esto, un solo request con error apagaba el
// servidor completo para todos los usuarios, no solo devolvía un 500.
import 'express-async-errors';
import cors from 'cors';

import { requireAuth, requireAdmin, bootstrapInitialAdmins } from './auth.js';
import { authRouter } from './routes/auth.js';
import { usuariosRouter } from './routes/usuarios.js';
import { productosRouter } from './routes/productos.js';
import { vendedoresRouter } from './routes/vendedores.js';
import { equipoRouter } from './routes/equipo.js';
import { rutasRouter } from './routes/rutas.js';
import { prospectosRouter } from './routes/prospectos.js';
import { visitasRouter } from './routes/visitas.js';
import { ubicacionesRouter } from './routes/ubicaciones.js';
import { progresoRouter } from './routes/progreso.js';
import { metricasRouter } from './routes/metricas.js';
import { mapaRouter } from './routes/mapa.js';
import { seguimientoRouter } from './routes/seguimiento.js';
import { llamadasRouter } from './routes/llamadas.js';

export const app = express();
const origins = (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);

app.use(cors({ origin: origins.length ? origins : true }));
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

app.use('/api', requireAuth);

app.use('/api/auth', authRouter);
// Solo panel de admin: cualquier cuenta @avivacredito.com pasaba requireAuth,
// pero de aquí para abajo además hace falta un doc en `usuarios` (rol admin).
app.use('/api/usuarios', requireAdmin, usuariosRouter);
app.use('/api/productos', requireAdmin, productosRouter);
app.use('/api/vendedores', requireAdmin, vendedoresRouter);
app.use('/api/equipo', requireAdmin, equipoRouter);
app.use('/api/rutas', requireAdmin, rutasRouter);
app.use('/api/metricas', requireAdmin, metricasRouter);
app.use('/api/mapa', requireAdmin, mapaRouter);
app.use('/api/seguimiento', requireAdmin, seguimientoRouter);
// Mixtos: la app del vendedor también usa algunas rutas de estos routers
// (ver comentarios dentro de cada archivo); requireAdmin se aplica ahí
// ruta por ruta, no a nivel router. `progreso` solo lo usa la app del
// vendedor (cada quien el suyo, igual que prospectos/visitas). En `llamadas`
// el vendedor registra las suyas y el admin las consulta.
app.use('/api/prospectos', prospectosRouter);
app.use('/api/visitas', visitasRouter);
app.use('/api/ubicaciones', ubicacionesRouter);
app.use('/api/progreso', progresoRouter);
app.use('/api/llamadas', llamadasRouter);

app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ error: 'internal_error', message: err?.message });
});

// Se dispara al cargar este módulo (una vez por arranque/cold start, tanto en
// dev vía server/src/index.ts como en Cloud Functions vía functions/src/index.ts,
// que ambos importan `app` desde aquí). No bloquea el arranque del servidor.
bootstrapInitialAdmins().catch((err) => console.error('bootstrapInitialAdmins falló:', err?.message || err));

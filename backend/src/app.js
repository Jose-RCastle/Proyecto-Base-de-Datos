import express from 'express';
import cors from 'cors';
import dashboardRoutes from './routes/dashboard.routes.js';
import clientesRoutes from './routes/clientes.routes.js';
import vehiculosRoutes from './routes/vehiculos.routes.js';
import espaciosRoutes from './routes/espacios.routes.js';
import estadiasRoutes from './routes/estadias.routes.js';
import pagosRoutes from './routes/pagos.routes.js';
import reportesRoutes from './routes/reportes.routes.js';

const app = express();
app.use(cors());
app.use(express.json());
app.get('/api/health', (_req, res) => res.json({ ok: true }));
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/vehiculos', vehiculosRoutes);
app.use('/api/espacios', espaciosRoutes);
app.use('/api/estadias', estadiasRoutes);
app.use('/api/pagos', pagosRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api', estadiasRoutes);
app.use((error, _req, res, _next) => { console.error(error); const message = error.code === '23505' ? 'Ya existe un registro con esos datos.' : (error.message || 'Ocurrió un error al procesar la solicitud.'); res.status(error.code?.startsWith('23') ? 400 : 500).json({ error: message }); });

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`PARKCONTROL API disponible en http://localhost:${port}`));

import 'dotenv/config';
import express from 'express';
import { sanitizeError } from './lib/sanitizeError.js';
import cors from 'cors';
import morgan from 'morgan';
import healthRouter from './routes/health.js';
import barangaysRouter from './routes/barangays.js';
import vetsRouter from './routes/vets.js';
import approvalsRouter from './routes/approvals.js';
import ownersRouter from './routes/owners.js';
import petsRouter from './routes/pets.js';
import vaccinationsRouter from './routes/vaccinations.js';
import driveSessionsRouter from './routes/drive-sessions.js';
import statsRouter     from './routes/stats.js';
import analyticsRouter from './routes/analytics.js';
import syncRouter      from './routes/sync.js';
import authRouter      from './routes/auth.js';
import { bootstrapSchema } from './local/db.js';

const app = express();
const PORT = process.env.PORT || 5001;

app.use(cors({ origin: process.env.CLIENT_ORIGIN || 'http://localhost:5173' }));
app.use(express.json());
app.use(morgan('dev'));

app.use('/api/auth',   authRouter);
app.use('/api/health', healthRouter);
app.use('/api/barangays', barangaysRouter);
app.use('/api/vets', vetsRouter);
app.use('/api/approvals', approvalsRouter);
app.use('/api/owners', ownersRouter);
app.use('/api/pets', petsRouter);
app.use('/api/vaccinations', vaccinationsRouter);
app.use('/api/drive-sessions', driveSessionsRouter);
app.use('/api/stats',     statsRouter);
app.use('/api/analytics', analyticsRouter);
app.use('/api/sync',      syncRouter);

app.get('/', (_req, res) => {
  res.json({ name: 'digivet-server', status: 'ok' });
});

app.use((_req, res) => {
  res.status(404).json({ error: 'Not Found' });
});

app.use((err, _req, res, _next) => {
  // Log full detail server-side only — never expose raw messages to the client
  console.error('[server] error:', err.code ?? '', err.message);
  res.status(500).json({ error: sanitizeError(err) });
});

try {
  await bootstrapSchema();
} catch (err) {
  console.error('[server] schema bootstrap failed — check PG credentials in .env:', err.message);
}

app.listen(PORT, () => {
  console.log(`DIGIVET server listening on http://localhost:${PORT}`);
});

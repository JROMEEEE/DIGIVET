import express from 'express';
import { query, dbInfo } from '../local/db.js';

const router = express.Router();

router.get('/', (_req, res) => {
  res.json({ status: 'ok', service: 'digivet-server', time: new Date().toISOString() });
});

router.get('/db', async (_req, res) => {
  try {
    const result = await query('SELECT 1 AS ok, NOW() AS server_time, current_database() AS db');
    res.json({
      status:      'ok',
      engine:      'postgresql',
      database:    result.rows[0].db,
      server_time: result.rows[0].server_time,
    });
  } catch (err) {
    console.error('[health/db] connection failed:', err.message);
    res.status(503).json({ status: 'error', message: 'Local database unavailable' });
  }
});

export default router;

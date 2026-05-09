import express from 'express';
import { query } from '../local/db.js';
import { syncRecord } from '../lib/syncRecord.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  const { rows } = await query(
    'SELECT vet_id, vet_name FROM vet_table ORDER BY vet_name',
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { vet_name } = req.body ?? {};
  if (!vet_name) return res.status(400).json({ error: 'vet_name is required' });
  const { rows } = await query(
    'INSERT INTO vet_table (vet_name) VALUES ($1) RETURNING vet_id, vet_name',
    [vet_name],
  );
  syncRecord('vet_table', 'vet_id', rows[0].vet_id);
  res.status(201).json(rows[0]);
});

export default router;

import express from 'express';
import { query } from '../local/db.js';

const router = express.Router();

router.get('/', async (_req, res) => {
  const { rows } = await query(
    'SELECT barangay_id, barangay_name FROM barangay_table ORDER BY barangay_name',
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { barangay_name } = req.body ?? {};
  if (!barangay_name) return res.status(400).json({ error: 'barangay_name is required' });
  const { rows } = await query(
    'INSERT INTO barangay_table (barangay_name) VALUES ($1) RETURNING barangay_id, barangay_name',
    [barangay_name],
  );
  res.status(201).json(rows[0]);
});

export default router;

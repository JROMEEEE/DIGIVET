import express from 'express';
import { query } from '../local/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const q = (req.query.q ?? '').trim();
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  if (!q) {
    const { rows } = await query(
      `SELECT o.owner_id, o.owner_name, o.contact_number,
              o.barangay_id, b.barangay_name
       FROM owner_table o
       LEFT JOIN barangay_table b ON b.barangay_id = o.barangay_id
       ORDER BY o.owner_id DESC
       LIMIT $1`,
      [limit],
    );
    return res.json(rows);
  }

  const like = `%${q}%`;
  const { rows } = await query(
    `SELECT o.owner_id, o.owner_name, o.contact_number,
            o.barangay_id, b.barangay_name
     FROM owner_table o
     LEFT JOIN barangay_table b ON b.barangay_id = o.barangay_id
     WHERE o.owner_name ILIKE $1
        OR o.contact_number ILIKE $1
        OR b.barangay_name ILIKE $1
     ORDER BY o.owner_name
     LIMIT $2`,
    [like, limit],
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT o.owner_id, o.owner_name, o.contact_number,
            o.barangay_id, b.barangay_name
     FROM owner_table o
     LEFT JOIN barangay_table b ON b.barangay_id = o.barangay_id
     WHERE o.owner_id = $1`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Owner not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { owner_name, contact_number, barangay_id } = req.body ?? {};
  if (!owner_name || !contact_number || !barangay_id) {
    return res.status(400).json({
      error: 'owner_name, contact_number, and barangay_id are required',
    });
  }
  const { rows } = await query(
    `INSERT INTO owner_table (owner_name, contact_number, barangay_id)
     VALUES ($1, $2, $3)
     RETURNING owner_id, owner_name, contact_number, barangay_id`,
    [owner_name, contact_number, barangay_id],
  );
  res.status(201).json(rows[0]);
});

export default router;

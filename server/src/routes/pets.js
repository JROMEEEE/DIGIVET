import express from 'express';
import { query } from '../local/db.js';
import { syncRecord } from '../lib/syncRecord.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { owner_id, barangay_id } = req.query;
  const params = [];
  const conditions = [];

  if (owner_id) {
    params.push(owner_id);
    conditions.push(`p.owner_id = $${params.length}`);
  }
  if (barangay_id) {
    params.push(barangay_id);
    conditions.push(`o.barangay_id = $${params.length}`);
  }
  conditions.push(`p.deleted_at IS NULL`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const { rows } = await query(
    `SELECT p.pet_id, p.pet_name, p.pet_type, p.pet_age, p.pet_color,
            p.owner_id, o.owner_name, o.contact_number
     FROM pet_table p
     LEFT JOIN owner_table o ON o.owner_id = p.owner_id
     ${where}
     ORDER BY o.owner_name, p.pet_name`,
    params,
  );
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(
    `SELECT p.pet_id, p.pet_name, p.pet_type, p.pet_age, p.pet_color,
            p.owner_id, o.owner_name, o.contact_number
     FROM pet_table p
     LEFT JOIN owner_table o ON o.owner_id = p.owner_id
     WHERE p.pet_id = $1 AND p.deleted_at IS NULL`,
    [req.params.id],
  );
  if (!rows[0]) return res.status(404).json({ error: 'Pet not found' });
  res.json(rows[0]);
});

router.post('/', async (req, res) => {
  const { owner_id, pet_name, pet_type, pet_age, pet_color } = req.body ?? {};
  if (!owner_id || !pet_name || !pet_type || !pet_age || !pet_color) {
    return res.status(400).json({
      error: 'owner_id, pet_name, pet_type, pet_age, and pet_color are required',
    });
  }
  const { rows } = await query(
    `INSERT INTO pet_table (owner_id, pet_name, pet_type, pet_age, pet_color)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING pet_id, owner_id, pet_name, pet_type, pet_age, pet_color`,
    [owner_id, pet_name, pet_type, pet_age, pet_color],
  );
  syncRecord('pet_table', 'pet_id', rows[0].pet_id);
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res, next) => {
  try {
    const { pet_name, pet_type, pet_age, pet_color } = req.body ?? {};
    if (!pet_name || !pet_type || !pet_age || !pet_color) {
      return res.status(400).json({ error: 'pet_name, pet_type, pet_age, and pet_color are required' });
    }
    const { rows } = await query(
      `UPDATE pet_table
       SET pet_name = $1, pet_type = $2, pet_age = $3, pet_color = $4
       WHERE pet_id = $5 AND deleted_at IS NULL
       RETURNING pet_id, owner_id, pet_name, pet_type, pet_age, pet_color`,
      [pet_name, pet_type, pet_age, pet_color, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pet not found' });
    syncRecord('pet_table', 'pet_id', rows[0].pet_id);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `UPDATE pet_table SET deleted_at = NOW()
       WHERE pet_id = $1 AND deleted_at IS NULL
       RETURNING pet_id`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Pet not found' });
    syncRecord('pet_table', 'pet_id', rows[0].pet_id);
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;

import express from 'express';
import { query } from '../local/db.js';

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
     WHERE p.pet_id = $1`,
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
  res.status(201).json(rows[0]);
});

export default router;

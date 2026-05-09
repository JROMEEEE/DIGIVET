import express from 'express';
import { query } from '../local/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { vet_id, q } = req.query;
  const limit = Math.min(parseInt(req.query.limit, 10) || 200, 500);
  const params = [];
  const conditions = [];

  if (vet_id) {
    params.push(Number(vet_id));
    conditions.push(`a.vet_id = $${params.length}`);
  }
  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    const n = params.length;
    conditions.push(
      `(a.approval_code ILIKE $${n} OR p.pet_name ILIKE $${n} OR o.owner_name ILIKE $${n})`,
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  params.push(limit);

  const { rows } = await query(
    `SELECT a.approval_id, a.approval_code,
            a.vet_id, vt.vet_name,
            p.pet_id, p.pet_name,
            o.owner_id, o.owner_name,
            -- Session barangay (where vaccination happened); fall back to owner's home barangay
            COALESCE(bs.barangay_name, bo.barangay_name) AS barangay_name,
            v.is_office_visit
     FROM approval_id_table a
     LEFT JOIN vet_table vt           ON vt.vet_id       = a.vet_id
     LEFT JOIN vaccine_table v        ON v.approval_id   = a.approval_id
     LEFT JOIN pet_table p            ON p.pet_id        = v.pet_id
     LEFT JOIN owner_table o          ON o.owner_id      = p.owner_id
     LEFT JOIN drive_session_table s  ON s.session_id    = v.session_id
     LEFT JOIN barangay_table bs      ON bs.barangay_id  = s.barangay_id
     LEFT JOIN barangay_table bo      ON bo.barangay_id  = o.barangay_id
     ${where}
     ORDER BY a.approval_id DESC
     LIMIT $${params.length}`,
    params,
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { vet_id, approval_code } = req.body ?? {};
  if (!vet_id || !approval_code) {
    return res.status(400).json({ error: 'vet_id and approval_code are required' });
  }
  const { rows } = await query(
    `INSERT INTO approval_id_table (vet_id, approval_code)
     VALUES ($1, $2)
     RETURNING approval_id, vet_id, approval_code`,
    [vet_id, approval_code],
  );
  res.status(201).json(rows[0]);
});

export default router;

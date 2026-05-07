import express from 'express';
import { query } from '../local/db.js';

const router = express.Router();

router.get('/', async (req, res) => {
  const { q } = req.query;
  const params = [];
  let where = '';

  if (q && q.trim()) {
    params.push(`%${q.trim()}%`);
    where = `WHERE b.barangay_name ILIKE $${params.length}`;
  }

  params.push(100);

  // DISTINCT ON (barangay_id, session_date) keeps only the latest session_id
  // per barangay+date combination, then outer query sorts for display.
  const { rows } = await query(
    `SELECT * FROM (
       SELECT DISTINCT ON (s.barangay_id, s.session_date)
              s.session_id, s.session_date,
              s.barangay_id, b.barangay_name
       FROM drive_session_table s
       LEFT JOIN barangay_table b ON b.barangay_id = s.barangay_id
       ${where}
       ORDER BY s.barangay_id, s.session_date DESC, s.session_id DESC
     ) deduped
     ORDER BY session_date DESC, barangay_name
     LIMIT $${params.length}`,
    params,
  );
  res.json(rows);
});

router.post('/', async (req, res) => {
  const { barangay_id, session_date } = req.body ?? {};
  if (!barangay_id) {
    return res.status(400).json({ error: 'barangay_id is required' });
  }
  const dateVal = session_date ?? new Date().toISOString().slice(0, 10);
  const { rows } = await query(
    `INSERT INTO drive_session_table (barangay_id, session_date)
     VALUES ($1, $2)
     RETURNING session_id`,
    [barangay_id, dateVal],
  );
  const { rows: detail } = await query(
    `SELECT s.session_id, s.session_date, s.barangay_id, b.barangay_name
     FROM drive_session_table s
     LEFT JOIN barangay_table b ON b.barangay_id = s.barangay_id
     WHERE s.session_id = $1`,
    [rows[0].session_id],
  );
  res.status(201).json(detail[0]);
});

export default router;

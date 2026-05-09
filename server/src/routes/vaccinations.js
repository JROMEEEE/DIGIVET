import express from 'express';
import crypto from 'node:crypto';
import { pool, query } from '../local/db.js';
import { syncRecord } from '../lib/syncRecord.js';

const router = express.Router();

function generateApprovalCode(year = new Date().getFullYear()) {
  const random = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `AP-${year}-${random}`;
}

const BASE_SELECT = `
  SELECT v.vaccine_id, v.vaccine_date, v.vaccine_details, v.manufacturer_no,
         v.pet_id, p.pet_name, p.pet_type, p.pet_age,
         p.owner_id, o.owner_name,
         b.barangay_name,
         v.vet_id, vt.vet_name,
         v.approval_id, a.approval_code,
         v.session_id, v.is_office_visit
  FROM vaccine_table v
  LEFT JOIN pet_table p           ON p.pet_id        = v.pet_id
  LEFT JOIN owner_table o         ON o.owner_id       = p.owner_id
  LEFT JOIN barangay_table b      ON b.barangay_id    = o.barangay_id
  LEFT JOIN vet_table vt          ON vt.vet_id        = v.vet_id
  LEFT JOIN approval_id_table a   ON a.approval_id    = v.approval_id
`;

router.get('/', async (req, res) => {
  const { pet_id, session_id, is_office_visit } = req.query;
  const params = [];
  const conditions = [];

  if (pet_id) {
    params.push(pet_id);
    conditions.push(`v.pet_id = $${params.length}`);
  }
  if (session_id) {
    params.push(session_id);
    conditions.push(`v.session_id = $${params.length}`);
  }
  if (is_office_visit === 'true') {
    conditions.push(`v.is_office_visit = TRUE`);
  }
  // Always exclude soft-deleted records
  conditions.push(`v.deleted_at IS NULL`);

  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  // Cap unfiltered queries to avoid loading the entire dataset
  let limitClause = '';
  if (!pet_id && !session_id) {
    params.push(500);
    limitClause = `LIMIT $${params.length}`;
  }

  const { rows } = await query(
    `${BASE_SELECT} ${where} ORDER BY v.vaccine_date DESC, v.vaccine_id DESC ${limitClause}`,
    params,
  );
  res.json(rows);
});

router.put('/:id', async (req, res, next) => {
  try {
    const { vaccine_date, vet_id, vaccine_details, manufacturer_no, is_office_visit } = req.body ?? {};
    if (!vaccine_date || !vet_id || !vaccine_details || !manufacturer_no) {
      return res.status(400).json({
        error: 'vaccine_date, vet_id, vaccine_details, and manufacturer_no are required',
      });
    }
    const { rows } = await query(
      `UPDATE vaccine_table
       SET vaccine_date = $1, vet_id = $2, vaccine_details = $3,
           manufacturer_no = $4, is_office_visit = $5
       WHERE vaccine_id = $6 AND deleted_at IS NULL
       RETURNING vaccine_id, pet_id, vet_id, vaccine_date, vaccine_details,
                 manufacturer_no, session_id, is_office_visit`,
      [vaccine_date, Number(vet_id), vaccine_details, manufacturer_no,
       is_office_visit ?? false, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Record not found' });
    syncRecord('vaccine_table', 'vaccine_id', rows[0].vaccine_id);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    // Soft delete — preserves record for sync/audit; approval_id stays intact
    const { rows } = await query(
      `UPDATE vaccine_table
       SET deleted_at = NOW()
       WHERE vaccine_id = $1 AND deleted_at IS NULL
       RETURNING vaccine_id`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Record not found' });
    syncRecord('vaccine_table', 'vaccine_id', Number(req.params.id));
    res.status(204).end();
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const {
    pet_id, vet_id,
    vaccine_date, vaccine_details, manufacturer_no,
    session_id, is_office_visit,
  } = req.body ?? {};

  if (!pet_id || !vet_id || !vaccine_date || !vaccine_details || !manufacturer_no) {
    return res.status(400).json({
      error: 'pet_id, vet_id, vaccine_date, vaccine_details, and manufacturer_no are required',
    });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const approval_code = generateApprovalCode(new Date(vaccine_date).getFullYear());
    const approvalRes = await client.query(
      `INSERT INTO approval_id_table (vet_id, approval_code)
       VALUES ($1, $2)
       RETURNING approval_id, approval_code`,
      [vet_id, approval_code],
    );
    const { approval_id } = approvalRes.rows[0];

    const vaxRes = await client.query(
      `INSERT INTO vaccine_table
         (pet_id, vet_id, approval_id, vaccine_date, vaccine_details, manufacturer_no,
          session_id, is_office_visit)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING vaccine_id, pet_id, vet_id, approval_id, vaccine_date, vaccine_details,
                 manufacturer_no, session_id, is_office_visit`,
      [
        pet_id, vet_id, approval_id, vaccine_date, vaccine_details, manufacturer_no,
        session_id ?? null,
        is_office_visit ?? false,
      ],
    );

    await client.query('COMMIT');
    const newVax = vaxRes.rows[0];
    syncRecord('approval_id_table', 'approval_id', newVax.approval_id);
    syncRecord('vaccine_table',     'vaccine_id',  newVax.vaccine_id);
    res.status(201).json({ ...newVax, approval_code });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

export default router;

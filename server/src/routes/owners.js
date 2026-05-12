import express from 'express';
import { query, pool } from '../local/db.js';
import { syncRecord } from '../lib/syncRecord.js';

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
       WHERE o.deleted_at IS NULL
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
     WHERE o.deleted_at IS NULL
       AND (o.owner_name ILIKE $1
        OR o.contact_number ILIKE $1
        OR b.barangay_name ILIKE $1)
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
     WHERE o.owner_id = $1 AND o.deleted_at IS NULL`,
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
  syncRecord('owner_table', 'owner_id', rows[0].owner_id);
  res.status(201).json(rows[0]);
});

router.put('/:id', async (req, res, next) => {
  try {
    const { owner_name, contact_number, barangay_id } = req.body ?? {};
    if (!owner_name || !contact_number || !barangay_id) {
      return res.status(400).json({ error: 'owner_name, contact_number, and barangay_id are required' });
    }
    const { rows } = await query(
      `UPDATE owner_table
       SET owner_name = $1, contact_number = $2, barangay_id = $3
       WHERE owner_id = $4 AND deleted_at IS NULL
       RETURNING owner_id, owner_name, contact_number, barangay_id`,
      [owner_name, contact_number, Number(barangay_id), req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Owner not found' });
    syncRecord('owner_table', 'owner_id', rows[0].owner_id);
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1. Collect affected pet IDs
    const { rows: petRows } = await client.query(
      `SELECT pet_id FROM pet_table WHERE owner_id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );
    const petIds = petRows.map((r) => r.pet_id);

    // 2. Collect vaccine IDs BEFORE soft-deleting them
    let vaccineIds = [];
    if (petIds.length > 0) {
      const { rows: vaxRows } = await client.query(
        `SELECT vaccine_id FROM vaccine_table WHERE pet_id = ANY($1) AND deleted_at IS NULL`,
        [petIds],
      );
      vaccineIds = vaxRows.map((r) => r.vaccine_id);
    }

    // 3. Cascade soft-delete vaccinations
    if (vaccineIds.length > 0) {
      await client.query(
        `UPDATE vaccine_table SET deleted_at = NOW()
         WHERE vaccine_id = ANY($1)`,
        [vaccineIds],
      );
    }

    // 4. Cascade soft-delete pets
    await client.query(
      `UPDATE pet_table SET deleted_at = NOW()
       WHERE owner_id = $1 AND deleted_at IS NULL`,
      [req.params.id],
    );

    // 5. Soft-delete the owner
    const { rows } = await client.query(
      `UPDATE owner_table SET deleted_at = NOW()
       WHERE owner_id = $1 AND deleted_at IS NULL
       RETURNING owner_id`,
      [req.params.id],
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Owner not found' }); }

    await client.query('COMMIT');

    // Sync all affected records to Supabase — hard-deletes since deleted_at is now set
    syncRecord('owner_table', 'owner_id', rows[0].owner_id);
    for (const pid of petIds)     syncRecord('pet_table',     'pet_id',     pid);
    for (const vid of vaccineIds)  syncRecord('vaccine_table', 'vaccine_id', vid);

    res.status(204).end();
  } catch (err) { await client.query('ROLLBACK'); next(err); }
  finally { client.release(); }
});

export default router;

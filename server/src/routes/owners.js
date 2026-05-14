import express from 'express';
import bcrypt from 'bcryptjs';
import { query, pool } from '../local/db.js';
import { syncRecord } from '../lib/syncRecord.js';
import { sendOwnerCredentials } from '../lib/email.js';

function generatePassword(len = 10) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
  const q = (req.query.q ?? '').trim();
  const limit = Math.min(Number(req.query.limit) || 20, 100);

  if (!q) {
    const { rows } = await query(
      `SELECT o.owner_id, o.owner_name, o.contact_number,
              o.email, o.barangay_id, b.barangay_name
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
            o.email, o.barangay_id, b.barangay_name
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
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT o.owner_id, o.owner_name, o.contact_number,
              o.email, o.barangay_id, b.barangay_name
       FROM owner_table o
       LEFT JOIN barangay_table b ON b.barangay_id = o.barangay_id
       WHERE o.owner_id = $1 AND o.deleted_at IS NULL`,
      [req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Owner not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { owner_name, contact_number, barangay_id, email } = req.body ?? {};
    console.log('[owners POST] received:', { owner_name, contact_number, barangay_id, email });
    if (!owner_name || !barangay_id) {
      return res.status(400).json({ error: 'owner_name and barangay_id are required' });
    }

    // Dedup checks before opening the transaction
    const dupName = await query(
      `SELECT owner_id, owner_name FROM owner_table WHERE owner_name = $1 AND deleted_at IS NULL`,
      [owner_name],
    );
    if (dupName.rows.length > 0) {
      return res.status(409).json({
        error: 'An owner with this name already exists',
        existing_owner_id: dupName.rows[0].owner_id,
        existing_owner_name: dupName.rows[0].owner_name,
      });
    }
    if (email) {
      const dupEmail = await query(
        `SELECT owner_id, owner_name FROM owner_table WHERE email = $1 AND deleted_at IS NULL`,
        [email],
      );
      if (dupEmail.rows.length > 0) {
        return res.status(409).json({
          error: 'An owner with this email already exists',
          existing_owner_id: dupEmail.rows[0].owner_id,
          existing_owner_name: dupEmail.rows[0].owner_name,
        });
      }
    }

    await client.query('BEGIN');

    // Insert owner (with optional email)
    const { rows: ownerRows } = await client.query(
      `INSERT INTO owner_table (owner_name, contact_number, barangay_id, email)
       VALUES ($1, $2, $3, $4)
       RETURNING owner_id, owner_name, contact_number, barangay_id, email`,
      [owner_name, contact_number, barangay_id, email ?? null],
    );
    const owner = ownerRows[0];

    let accountCreated = false;

    if (email) {
      // Check if a user_profile already exists for this email
      const existing = await client.query(
        `SELECT id FROM user_profile WHERE local_email = $1`, [email]
      );

      if (existing.rows.length === 0) {
        const password = generatePassword();
        const hash = await bcrypt.hash(password, 10);

        await client.query(
          `INSERT INTO user_profile (display_name, role, local_email, local_password_hash, owner_id)
           VALUES ($1, 'OWNER', $2, $3, $4)`,
          [owner_name, email, hash, owner.owner_id],
        );

        await client.query('COMMIT');

        let emailError = null;
        try {
          await sendOwnerCredentials({ toEmail: email, ownerName: owner_name, password });
          console.log('[email] credentials sent to', email);
        } catch (err) {
          emailError = err.message;
          console.error('[email] FAILED to send to', email, '—', err.message, err.code ?? '');
        }

        accountCreated = true;
        if (emailError) {
          syncRecord('owner_table', 'owner_id', owner.owner_id);
          return res.status(201).json({ ...owner, account_created: true, email_error: emailError });
        }
      } else {
        // Link existing account to this owner if not already linked
        await client.query(
          `UPDATE user_profile SET owner_id = $1
           WHERE local_email = $2 AND owner_id IS NULL`,
          [owner.owner_id, email],
        );
        await client.query('COMMIT');
        accountCreated = true;
      }
    } else {
      await client.query('COMMIT');
    }

    syncRecord('owner_table', 'owner_id', owner.owner_id);
    res.status(201).json({ ...owner, account_created: accountCreated });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { owner_name, contact_number, barangay_id, email } = req.body ?? {};
    if (!owner_name || !barangay_id) {
      return res.status(400).json({ error: 'owner_name and barangay_id are required' });
    }

    // Reject if the new email is already taken by a different active owner
    if (email) {
      const dupEmail = await query(
        `SELECT owner_id FROM owner_table WHERE email = $1 AND deleted_at IS NULL AND owner_id != $2`,
        [email, req.params.id],
      );
      if (dupEmail.rows.length > 0) {
        return res.status(409).json({ error: 'An owner with this email already exists' });
      }
    }

    // Reject if the new name is already taken by a different active owner
    const dupName = await query(
      `SELECT owner_id FROM owner_table WHERE owner_name = $1 AND deleted_at IS NULL AND owner_id != $2`,
      [owner_name, req.params.id],
    );
    if (dupName.rows.length > 0) {
      return res.status(409).json({ error: 'An owner with this name already exists' });
    }

    const { rows } = await query(
      `UPDATE owner_table
       SET owner_name = $1, contact_number = $2, barangay_id = $3, email = $4
       WHERE owner_id = $5 AND deleted_at IS NULL
       RETURNING owner_id, owner_name, contact_number, barangay_id, email`,
      [owner_name, contact_number ?? '', Number(barangay_id), email ?? null, req.params.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'Owner not found' });

    // Keep linked user_profile display_name and email in sync
    await query(
      `UPDATE user_profile SET display_name = $1, local_email = $2 WHERE owner_id = $3`,
      [owner_name, email ?? null, rows[0].owner_id],
    ).catch((e) => console.warn('[owners] user_profile sync skipped:', e.message));

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

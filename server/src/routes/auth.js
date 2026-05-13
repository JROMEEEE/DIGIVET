// Local-dev auth backed by user_profile.
// When Supabase Auth is live: remove register/login routes; only /me remains
// (it will validate the Supabase JWT and look up user_profile by UUID).

import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, pool } from '../local/db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { sendOwnerCredentials } from '../lib/email.js';

const router = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET ?? 'digivet-dev-secret-change-in-prod';
const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    { id: user.id, role: user.role, owner_id: user.owner_id ?? null },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

function safeUser(u) {
  const { local_password_hash, ...rest } = u;
  return rest;
}

/* ── Register (local dev only) ───────────────────────────────── */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, display_name } = req.body ?? {};

    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'email, password, and display_name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    const dup = await query(
      'SELECT id FROM user_profile WHERE local_email = $1', [email]
    );
    if (dup.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const hash = await bcrypt.hash(password, SALT_ROUNDS);

    const { rows } = await query(
      `INSERT INTO user_profile (display_name, role, local_email, local_password_hash)
       VALUES ($1, 'ADMIN', $2, $3)
       RETURNING id, display_name, role, local_email AS email, owner_id, created_at`,
      [display_name, email, hash],
    );

    const user = rows[0];
    res.status(201).json({ user: safeUser(user), token: signToken(user) });
  } catch (err) { next(err); }
});

/* ── Login (local dev only) ──────────────────────────────────── */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await query(
      `SELECT id, display_name, role, local_email AS email,
              local_password_hash, owner_id, created_at
       FROM user_profile WHERE local_email = $1`,
      [email],
    );
    if (!rows[0]) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];
    if (!user.local_password_hash) {
      return res.status(401).json({ error: 'Account not set up for local login.' });
    }

    const valid = await bcrypt.compare(password, user.local_password_hash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ user: safeUser(user), token: signToken(user) });
  } catch (err) { next(err); }
});

/* ── Me ──────────────────────────────────────────────────────── */
// TODO (Supabase): swap JWT verification for Supabase JWT validation.
// The SELECT stays the same — just look up user_profile by UUID id.
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT id, display_name, role, local_email AS email, owner_id, created_at
       FROM user_profile WHERE id = $1`,
      [req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── Update me ────────────────────────────────────────────────── */
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { display_name, email, password } = req.body ?? {};
    const userId = req.user.id;

    if (email) {
      const dup = await query(
        `SELECT id FROM user_profile WHERE local_email = $1 AND id != $2`,
        [email, userId],
      );
      if (dup.rows.length > 0) return res.status(409).json({ error: 'Email already in use' });
    }

    const sets = []; const params = [];
    const add  = (col, val) => { sets.push(`${col} = $${params.push(val)}`); };

    if (display_name?.trim()) add('display_name', display_name.trim());
    if (email?.trim())        add('local_email',  email.trim());
    if (password) {
      add('local_password_hash', await bcrypt.hash(password, SALT_ROUNDS));
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(userId);
    const { rows } = await query(
      `UPDATE user_profile SET ${sets.join(', ')}
       WHERE id = $${params.length}
       RETURNING id, display_name, role, local_email AS email, owner_id, created_at`,
      params,
    );
    res.json({ user: safeUser(rows[0]) });
  } catch (err) { next(err); }
});

/* ── Delete me ────────────────────────────────────────────────── */
router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM user_profile WHERE id = $1 RETURNING id',
      [req.user.id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.status(204).end();
  } catch (err) { next(err); }
});

/* ── Test email (dev only) ────────────────────────────────────── */
router.post('/test-email', async (req, res, next) => {
  try {
    const { to } = req.body ?? {};
    if (!to) return res.status(400).json({ error: 'to is required' });
    await sendOwnerCredentials({ toEmail: to, ownerName: 'Test Owner', password: 'TestPass123' });
    res.json({ ok: true, message: `Test email sent to ${to}` });
  } catch (err) {
    res.status(500).json({ error: err.message, code: err.code });
  }
});

export default router;

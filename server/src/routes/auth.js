import express from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query, pool } from '../local/db.js';
import { requireAuth } from '../middleware/requireAuth.js';

const router = express.Router();
const JWT_SECRET  = process.env.JWT_SECRET ?? 'digivet-dev-secret-change-in-prod';
const SALT_ROUNDS = 10;

function signToken(user) {
  return jwt.sign(
    { user_id: user.user_id, role: user.role, email: user.email },
    JWT_SECRET,
    { expiresIn: '7d' },
  );
}

// Strip both password fields before sending to client
function safeUser(u) {
  const { password, password_hash, ...rest } = u;
  return rest;
}

// Split "First Last Name" → { fname, lname }
function splitName(display_name) {
  const parts = display_name.trim().split(/\s+/);
  return {
    fname: parts[0],
    lname: parts.slice(1).join(' ') || parts[0], // fallback: repeat if single name
  };
}

/* ── Register ─────────────────────────────────────────────── */
router.post('/register', async (req, res, next) => {
  try {
    const { email, password, display_name } = req.body ?? {};

    if (!email || !password || !display_name) {
      return res.status(400).json({ error: 'email, password, and display_name are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Check uniqueness on both email and username (we use email as username)
    const existing = await query(
      'SELECT user_id FROM user_table WHERE email = $1 OR username = $1',
      [email],
    );
    if (existing.rows.length > 0) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);
    const { fname, lname } = splitName(display_name);

    // Both inserts in one transaction — if user_table fails, userinfo_table is rolled back too
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      const userinfoRes = await client.query(
        `INSERT INTO userinfo_table (userinfo_fname, userinfo_lname)
         VALUES ($1, $2) RETURNING userinfo_id`,
        [fname, lname],
      );
      const { userinfo_id } = userinfoRes.rows[0];

      const userRes = await client.query(
        `INSERT INTO user_table
           (userinfo_id, username, password, user_role, email, role, display_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING user_id, email, role, display_name, created_at`,
        [userinfo_id, email, password_hash, 'admin', email, 'ADMIN', display_name],
      );

      await client.query('COMMIT');
      const user = userRes.rows[0];
      res.status(201).json({ user: safeUser(user), token: signToken(user) });
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  } catch (err) { next(err); }
});

/* ── Login ────────────────────────────────────────────────── */
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};
    if (!email || !password) {
      return res.status(400).json({ error: 'email and password are required' });
    }

    const { rows } = await query(
      'SELECT * FROM user_table WHERE email = $1',
      [email],
    );
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const user = rows[0];

    if (!user.password) {
      return res.status(401).json({ error: 'Account not set up for login. Please re-register.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    res.json({ user: safeUser(user), token: signToken(user) });
  } catch (err) { next(err); }
});

/* ── Me ───────────────────────────────────────────────────── */
router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT user_id, email, role, display_name, created_at
       FROM user_table WHERE user_id = $1`,
      [req.user.user_id],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) { next(err); }
});

/* ── Update me ────────────────────────────────────────────── */
router.put('/me', requireAuth, async (req, res, next) => {
  try {
    const { display_name, email, password } = req.body ?? {};
    const userId = req.user.user_id;

    if (email) {
      const dup = await query(
        `SELECT user_id FROM user_table
         WHERE (email = $1 OR username = $1) AND user_id != $2`,
        [email, userId],
      );
      if (dup.rows.length > 0) return res.status(409).json({ error: 'Email already in use' });
    }

    const sets = []; const params = [];
    const add = (col, val) => { sets.push(`${col} = $${params.push(val)}`); };

    if (display_name?.trim()) add('display_name', display_name.trim());
    if (email?.trim())        { add('email', email.trim()); add('username', email.trim()); }
    if (password) {
      const h = await bcrypt.hash(password, SALT_ROUNDS);
      add('password', h);
    }

    if (sets.length === 0) return res.status(400).json({ error: 'Nothing to update' });

    params.push(userId);
    const { rows } = await query(
      `UPDATE user_table SET ${sets.join(', ')}
       WHERE user_id = $${params.length}
       RETURNING user_id, email, role, display_name, created_at`,
      params,
    );
    res.json({ user: safeUser(rows[0]) });
  } catch (err) { next(err); }
});

/* ── Delete me ────────────────────────────────────────────── */
router.delete('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.user_id;
    const { rows } = await query(
      'DELETE FROM user_table WHERE user_id = $1 RETURNING userinfo_id',
      [userId],
    );
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    if (rows[0].userinfo_id) {
      await query('DELETE FROM userinfo_table WHERE userinfo_id = $1', [rows[0].userinfo_id]);
    }
    res.status(204).end();
  } catch (err) { next(err); }
});

export default router;

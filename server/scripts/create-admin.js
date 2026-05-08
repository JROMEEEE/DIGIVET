// One-time script: creates the default admin account.
// Run from the server directory: node scripts/create-admin.js
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import { pool, bootstrapSchema } from '../src/local/db.js';

const EMAIL        = 'admin@digivet.local';
const PASSWORD     = 'Admin@1234';
const DISPLAY_NAME = 'Administrator';

try {
  await bootstrapSchema();

  const existing = await pool.query(
    'SELECT user_id FROM user_table WHERE email = $1 OR username = $1',
    [EMAIL],
  );
  if (existing.rows.length > 0) {
    console.log(`Admin already exists (user_id = ${existing.rows[0].user_id}). Nothing to do.`);
    await pool.end();
    process.exit(0);
  }

  const password_hash = await bcrypt.hash(PASSWORD, 10);

  // Insert userinfo first (required by original schema)
  const uiRes = await pool.query(
    `INSERT INTO userinfo_table (userinfo_fname, userinfo_lname)
     VALUES ($1, $2) RETURNING userinfo_id`,
    ['Administrator', 'System'],
  );
  const { userinfo_id } = uiRes.rows[0];

  const { rows } = await pool.query(
    `INSERT INTO user_table
       (userinfo_id, username, password, user_role, email, role, display_name)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING user_id, email, role, display_name`,
    [userinfo_id, EMAIL, password_hash, 'admin', EMAIL, 'ADMIN', DISPLAY_NAME],
  );

  console.log('✓ Admin account created:');
  console.log(`  user_id      : ${rows[0].user_id}`);
  console.log(`  email        : ${rows[0].email}`);
  console.log(`  display_name : ${rows[0].display_name}`);
  console.log(`  password     : ${PASSWORD}`);
  console.log('\nChange this password after first login.');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}

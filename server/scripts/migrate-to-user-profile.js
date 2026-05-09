// Migrates existing user_table rows into the new user_profile table.
// Run ONCE: node scripts/migrate-to-user-profile.js
import 'dotenv/config';
import { pool, bootstrapSchema } from '../src/local/db.js';

try {
  await bootstrapSchema();   // creates user_profile if not yet done

  const { rows: existing } = await pool.query(
    `SELECT user_id, display_name, email, password, role FROM user_table
     WHERE email IS NOT NULL`
  );

  if (existing.length === 0) {
    console.log('No users found in user_table. Nothing to migrate.');
  } else {
    console.log(`Migrating ${existing.length} user(s)...\n`);
    for (const u of existing) {
      // Skip if already migrated
      const dup = await pool.query(
        `SELECT id FROM user_profile WHERE local_email = $1`, [u.email]
      );
      if (dup.rows.length > 0) {
        console.log(`  ↷ Skip ${u.email} (already in user_profile)`);
        continue;
      }

      const role = u.role === 'ADMIN' ? 'ADMIN' : 'ADMIN'; // local system = vet only
      const { rows } = await pool.query(
        `INSERT INTO user_profile (display_name, role, local_email, local_password_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, display_name, local_email`,
        [u.display_name ?? 'User', role, u.email, u.password]
      );
      console.log(`  ✓ ${rows[0].local_email} → ${rows[0].id}`);
    }
  }

  console.log('\nDone. user_table is still intact — drop it manually once verified.');
} catch (err) {
  console.error('Migration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}

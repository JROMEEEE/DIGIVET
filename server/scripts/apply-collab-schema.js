// Adds columns present in the collaborator's dump that are missing locally.
// Run BEFORE doing a data-only restore: node scripts/apply-collab-schema.js
import 'dotenv/config';
import { pool } from '../src/local/db.js';

const steps = [
  `ALTER TABLE owner_table   ADD COLUMN IF NOT EXISTS email    VARCHAR(255)`,
  `ALTER TABLE user_profile  ADD COLUMN IF NOT EXISTS owner_id INT`,
];

for (const sql of steps) {
  await pool.query(sql);
  console.log('✓', sql.slice(0, 70));
}

console.log('\nDone. Now restore with data-only flag:');
console.log('pg_restore -U postgres -d DIGIVETDB --data-only --no-owner "DIGIVETDB.sql"');
await pool.end();

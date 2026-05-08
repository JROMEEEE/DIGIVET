// Applies user_table auth columns directly to the DB.
// Run from the server directory: node scripts/migrate-user-table.js
import 'dotenv/config';
import { pool } from '../src/local/db.js';

const steps = [
  // Ensure the table exists at all
  `CREATE TABLE IF NOT EXISTS user_table (user_id INT PRIMARY KEY)`,

  // Auth columns
  `ALTER TABLE user_table ADD COLUMN IF NOT EXISTS email         VARCHAR(255)`,
  `ALTER TABLE user_table ADD COLUMN IF NOT EXISTS password_hash TEXT`,
  `ALTER TABLE user_table ADD COLUMN IF NOT EXISTS role          VARCHAR(10) NOT NULL DEFAULT 'USER'`,
  `ALTER TABLE user_table ADD COLUMN IF NOT EXISTS display_name  VARCHAR(255)`,
  `ALTER TABLE user_table ADD COLUMN IF NOT EXISTS created_at    TIMESTAMPTZ DEFAULT NOW()`,

  // Auto-increment sequence for user_id
  `DO $$
   BEGIN
     IF NOT EXISTS (
       SELECT 1 FROM pg_class WHERE relname = 'user_table_user_id_seq' AND relkind = 'S'
     ) THEN
       CREATE SEQUENCE user_table_user_id_seq;
     END IF;
     ALTER SEQUENCE user_table_user_id_seq OWNED BY user_table.user_id;
     ALTER TABLE user_table ALTER COLUMN user_id SET DEFAULT nextval('user_table_user_id_seq');
     PERFORM setval(
       'user_table_user_id_seq',
       COALESCE((SELECT MAX(user_id) FROM user_table), 0) + 1,
       false
     );
   END $$`,
];

try {
  for (const sql of steps) {
    await pool.query(sql);
    console.log('✓', sql.trim().split('\n')[0].slice(0, 72));
  }
  console.log('\nMigration complete. Restart the server, then register.');
} catch (err) {
  console.error('\nMigration failed:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}

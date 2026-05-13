import 'dotenv/config';
import { pool } from '../src/local/db.js';

const { rows } = await pool.query(`
  SELECT table_name, column_name, data_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name IN ('owner_table', 'user_profile')
    AND column_name IN ('email', 'owner_id', 'local_email', 'local_password_hash')
  ORDER BY table_name, column_name
`);

console.log('Checking relevant columns:\n');
console.table(rows);
await pool.end();

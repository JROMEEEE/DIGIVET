import 'dotenv/config';
import { pool } from '../src/local/db.js';

const { rows } = await pool.query(`
  SELECT constraint_name, check_clause
  FROM information_schema.check_constraints
  WHERE constraint_schema = 'public'
    AND constraint_name LIKE '%user%'
`);
console.table(rows);
await pool.end();

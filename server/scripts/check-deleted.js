import 'dotenv/config';
import { pool } from '../src/local/db.js';

const checks = [
  ['vaccine_table',  'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS soft_deleted FROM vaccine_table'],
  ['pet_table',      'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS soft_deleted FROM pet_table'],
  ['owner_table',    'SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE deleted_at IS NOT NULL)::int AS soft_deleted FROM owner_table'],
];

for (const [label, sql] of checks) {
  const { rows } = await pool.query(sql);
  const { total, soft_deleted } = rows[0];
  console.log(`${label.padEnd(18)} total: ${total}  soft-deleted: ${soft_deleted}  active: ${total - soft_deleted}`);
}

await pool.end();

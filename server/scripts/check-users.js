import 'dotenv/config';
import { pool } from '../src/local/db.js';

console.log('── user_table ──────────────────────────────');
const ut = await pool.query(`SELECT user_id, username, email, role, display_name, local_email, created_at FROM user_table`).catch(e => ({ rows: [], error: e.message }));
if (ut.error) console.log('Error:', ut.error);
else console.table(ut.rows);

console.log('\n── user_profile ────────────────────────────');
const up = await pool.query(`SELECT id, display_name, role, local_email, created_at FROM user_profile`).catch(e => ({ rows: [], error: e.message }));
if (up.error) console.log('Error:', up.error);
else console.table(up.rows);

await pool.end();

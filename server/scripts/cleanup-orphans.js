// Removes userinfo_table rows that have no matching user_table entry.
import 'dotenv/config';
import { pool } from '../src/local/db.js';

const { rows: orphans } = await pool.query(`
  SELECT ui.userinfo_id, ui.userinfo_fname, ui.userinfo_lname
  FROM userinfo_table ui
  LEFT JOIN user_table u ON u.userinfo_id = ui.userinfo_id
  WHERE u.userinfo_id IS NULL
`);

if (orphans.length === 0) {
  console.log('No orphaned rows found.');
} else {
  console.log(`Found ${orphans.length} orphan(s):`);
  orphans.forEach((r) =>
    console.log(`  userinfo_id=${r.userinfo_id}  ${r.userinfo_fname} ${r.userinfo_lname}`)
  );

  const ids = orphans.map((r) => r.userinfo_id);
  await pool.query(`DELETE FROM userinfo_table WHERE userinfo_id = ANY($1)`, [ids]);
  console.log('Deleted.');
}

await pool.end();

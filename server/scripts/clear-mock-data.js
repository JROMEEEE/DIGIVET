// Clears all vaccination/pet/owner data in dependency order.
// Preserves: vet_table, user_profile, barangay_table.
// Run: node scripts/clear-mock-data.js
import 'dotenv/config';
import { pool } from '../src/local/db.js';

const steps = [
  ['vaccine_table',       'DELETE FROM vaccine_table'],
  ['approval_id_table',   'DELETE FROM approval_id_table'],
  ['drive_session_table', 'DELETE FROM drive_session_table'],
  ['pet_table',           'DELETE FROM pet_table'],
  ['owner_table',         'DELETE FROM owner_table'],
];

try {
  for (const [label, sql] of steps) {
    const { rowCount } = await pool.query(sql);
    console.log(`✓ ${label}: ${rowCount} row(s) deleted`);
  }
  console.log('\nDone. Vets, users, and barangays untouched.');
} catch (err) {
  console.error('Error:', err.message);
  process.exit(1);
} finally {
  await pool.end();
}

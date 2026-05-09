import 'dotenv/config';
import { supabaseAdmin } from '../src/lib/supabase.js';

console.log('Verifying Supabase DB tables...\n');

const tables = [
  'barangay_table',
  'owner_table',
  'pet_table',
  'vet_table',
  'vaccine_table',
  'approval_id_table',
  'drive_session_table',
  'user_profile',
];

let allOk = true;

for (const table of tables) {
  const { data, error, count } = await supabaseAdmin
    .from(table)
    .select('*', { count: 'exact', head: true });

  if (error) {
    console.error(`✗ ${table.padEnd(22)} →  ${error.message}`);
    allOk = false;
  } else {
    console.log(`✓ ${table.padEnd(22)} →  ${count ?? 0} rows`);
  }
}

console.log(allOk ? '\nAll tables reachable.' : '\nSome tables missing — check Supabase dashboard.');

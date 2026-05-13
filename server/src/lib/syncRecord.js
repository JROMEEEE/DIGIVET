// Immediately reflects a single local write to Supabase.
// Fire-and-forget — never blocks the HTTP response.
// Does NOT touch sync_log — the bulk push cursor is managed separately.

import { query }        from '../local/db.js';
import { supabaseAdmin } from './supabase.js';

export async function syncRecord(table, pkCol, pkVal) {
  if (!supabaseAdmin) return;
  try {
    const { rows } = await query(
      `SELECT * FROM ${table} WHERE ${pkCol} = $1`,
      [pkVal],
    );
    if (!rows[0]) return;

    const row = rows[0];

    if (row.deleted_at) {
      // Soft-deleted locally → hard-delete from Supabase so the online side is clean
      const { error } = await supabaseAdmin
        .from(table)
        .delete()
        .eq(pkCol, pkVal);
      if (error) console.warn(`[sync] Supabase delete failed — ${table}#${pkVal}:`, error.message);
    } else {
      // Strip local-dev-only auth columns before pushing user_profile to Supabase.
      // local_password_hash is never sent online — Supabase Auth handles passwords.
      const payload = table === 'user_profile'
        ? (({ local_password_hash, ...rest }) => rest)(row)
        : row;

      const { error } = await supabaseAdmin
        .from(table)
        .upsert(payload, { onConflict: pkCol });
      if (error) console.warn(`[sync] Supabase upsert failed — ${table}#${pkVal}:`, error.message);
    }
  } catch (err) {
    console.warn(`[sync] Sync error for ${table}#${pkVal}:`, err.message);
  }
}

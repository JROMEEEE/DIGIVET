// syncRecord is intentionally disabled.
// All Supabase sync is done exclusively via the bulk push (/api/sync/push).
// Immediate per-record sync caused the mirror status to falsely detect
// "Supabase has new changes" after every local encode because Supabase's
// trigger would bump updated_at above the mirror baseline.
export async function syncRecord() {
  // no-op — use bulk push
}

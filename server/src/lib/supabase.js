import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_KEY;
const anonKey   = process.env.SUPABASE_ANON_KEY;

if (!url || !serviceKey) {
  console.warn('[supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY not set — Supabase client disabled.');
}

// Service-role client: full DB access, backend-only, never expose to client
export const supabaseAdmin = url && serviceKey
  ? createClient(url, serviceKey, { auth: { persistSession: false } })
  : null;

// Anon client: respects Row Level Security, safe for authenticated requests
export const supabaseAnon = url && anonKey
  ? createClient(url, anonKey, { auth: { persistSession: false } })
  : null;

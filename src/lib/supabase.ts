import { createClient } from "@supabase/supabase-js";

// Lazy initialization — avoids crashing at build time when env vars are absent.
// Returns null when Supabase is not configured (stats are silently skipped).
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

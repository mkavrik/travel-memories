/**
 * Supabase client for server-side cache (blog_cache tables).
 * Uses NEXT_PUBLIC_* so the same keys work in API routes and server components.
 * Returns null when env vars are missing (cache is skipped, R2 is used only).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export function createSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

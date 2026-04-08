/**
 * Supabase client for server-side cache (blog_cache tables).
 * Uses NEXT_PUBLIC_* so the same keys work in API routes and server components.
 * Returns null when env vars are missing (cache is skipped, R2 is used only).
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function createSupabaseClient(): SupabaseClient | null {
  if (!url || !anonKey) return null;
  return createClient(url, anonKey);
}

/** Client with service_role key — bypasses RLS. Use for server-side writes. */
export function createSupabaseServiceClient(): SupabaseClient | null {
  if (!url || !serviceRoleKey) return null;
  return createClient(url, serviceRoleKey);
}

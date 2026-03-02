import { createBrowserClient } from '@supabase/ssr';

/**
 * Supabase client for Client Components. Uses cookies for session (magic link).
 * Use this in dashboard UI that needs auth (e.g. realtime, mutations).
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

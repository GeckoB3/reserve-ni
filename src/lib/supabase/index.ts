import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/** Read env at call time so Server Components get request-time env (fixes Turbopack/.env.local loading). */
function getEnv() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL is not set. Add it to .env.local in the project root and restart the dev server (npm run dev).'
    );
  }
  if (!supabaseAnonKey) {
    throw new Error('NEXT_PUBLIC_SUPABASE_ANON_KEY is not set. Add it to .env.local and restart the dev server.');
  }
  return { supabaseUrl, supabaseAnonKey, supabaseServiceRoleKey };
}

let browserClient: SupabaseClient | undefined;
let adminClient: SupabaseClient | undefined;

export const getSupabaseClient = (): SupabaseClient => {
  if (!browserClient) {
    const { supabaseUrl, supabaseAnonKey } = getEnv();
    browserClient = createClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
};

/**
 * Server-only Supabase client using the service role key.
 * Do not import this into client components or any browser code.
 */
export const getSupabaseAdminClient = (): SupabaseClient => {
  if (!adminClient) {
    const { supabaseUrl, supabaseServiceRoleKey } = getEnv();
    if (!supabaseServiceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. Add it to .env.local and restart the dev server.');
    }
    adminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: { persistSession: false },
    });
  }
  return adminClient;
};


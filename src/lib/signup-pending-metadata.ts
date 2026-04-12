import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SIGNUP_PENDING_BUSINESS_TYPE_KEY, SIGNUP_PENDING_PLAN_KEY } from '@/lib/signup-pending-selection';

export async function clearSignupPendingUserMetadata(admin: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await admin.auth.admin.getUserById(userId);
  if (error || !data.user) {
    console.warn('[signup-pending-metadata] getUserById failed:', error?.message);
    return;
  }
  const meta = { ...(data.user.user_metadata ?? {}) };
  delete meta[SIGNUP_PENDING_PLAN_KEY];
  delete meta[SIGNUP_PENDING_BUSINESS_TYPE_KEY];
  const { error: updErr } = await admin.auth.admin.updateUserById(userId, { user_metadata: meta });
  if (updErr) {
    console.warn('[signup-pending-metadata] clear failed:', updErr.message);
  }
}

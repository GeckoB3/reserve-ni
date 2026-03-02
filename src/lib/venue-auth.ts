/**
 * Helpers for venue API routes: resolve authenticated staff and venue.
 */

import type { SupabaseClient } from '@supabase/supabase-js';

export interface VenueStaff {
  venue_id: string;
  email: string;
  role: 'admin' | 'staff';
}

/**
 * Get the current user's staff record for their first venue.
 * Returns null if not authenticated or not a staff member.
 */
export async function getVenueStaff(supabase: SupabaseClient): Promise<VenueStaff | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const { data: rows } = await supabase
    .from('staff')
    .select('venue_id, email, role')
    .eq('email', user.email)
    .limit(1);

  const row = rows?.[0];
  if (!row) return null;

  return {
    venue_id: row.venue_id,
    email: row.email,
    role: row.role as 'admin' | 'staff',
  };
}

/**
 * Require admin role. Use after getVenueStaff; returns true if staff is admin.
 */
export function requireAdmin(staff: VenueStaff | null): staff is VenueStaff {
  return staff !== null && staff.role === 'admin';
}

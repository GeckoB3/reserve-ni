/**
 * Helpers for venue API routes: resolve authenticated staff and venue.
 *
 * All helpers use the service-role admin client for staff/data lookups so
 * queries are never blocked by the circular RLS policy on the staff table.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getStaffManagedCalendarIds, staffManagesCalendar } from '@/lib/staff-calendar-access';

export { getStaffManagedCalendarIds, staffManagesCalendar };

export interface VenueStaff {
  id: string;
  venue_id: string;
  email: string;
  role: 'admin' | 'staff';
  /** Admin client for data queries - bypasses RLS, safe to use after auth. */
  db: SupabaseClient;
}

/**
 * Get the current user's staff record for their first venue.
 * Returns null if not authenticated or not a staff member.
 *
 * The returned object includes a `db` property (admin client) that API routes
 * should use for all subsequent data queries. This avoids the circular RLS
 * issue where staff, venue, booking, etc. policies all cross-reference staff.
 */
export async function getVenueStaff(supabase: SupabaseClient): Promise<VenueStaff | null> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;

  const admin = getSupabaseAdminClient();
  const normalised = user.email.toLowerCase().trim();
  const { data: rows, error } = await admin
    .from('staff')
    .select('id, venue_id, email, role')
    .ilike('email', normalised)
    .limit(1);

  if (error) {
    console.error('[getVenueStaff] staff lookup failed:', error.message, { email: normalised });
    return null;
  }

  const row = rows?.[0];
  if (!row) return null;

  return {
    id: row.id,
    venue_id: row.venue_id,
    email: row.email,
    role: row.role as 'admin' | 'staff',
    db: admin,
  };
}

/**
 * Resolve the authenticated user and their venue for a dashboard page.
 * Returns null venue_id if not authenticated or no staff record.
 */
export async function getDashboardStaff(
  supabase: SupabaseClient
): Promise<{ id: string | null; email: string; venue_id: string | null; role: 'admin' | 'staff' | null; db: SupabaseClient }> {
  const admin = getSupabaseAdminClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return { id: null, email: '', venue_id: null, role: null, db: admin };

  const normalised = user.email.toLowerCase().trim();
  const { data: rows, error } = await admin
    .from('staff')
    .select('id, venue_id, role')
    .ilike('email', normalised)
    .limit(1);

  if (error) {
    console.error('[getDashboardStaff] staff lookup failed:', error.message, { email: normalised });
    return { id: null, email: normalised, venue_id: null, role: null, db: admin };
  }

  const row = rows?.[0];
  return {
    id: row?.id ?? null,
    email: normalised,
    venue_id: row?.venue_id ?? null,
    role: (row?.role as 'admin' | 'staff') ?? null,
    db: admin,
  };
}

/**
 * Require admin role. Use after getVenueStaff; returns true if staff is admin.
 */
export function requireAdmin(staff: VenueStaff | null): staff is VenueStaff {
  return staff !== null && staff.role === 'admin';
}

/**
 * First bookable calendar linked to this staff (legacy `practitioners` or unified junction).
 * Prefer `getStaffManagedCalendarIds` when multiple calendars are possible.
 */
export async function getLinkedPractitionerId(
  admin: SupabaseClient,
  venueId: string,
  staffId: string,
): Promise<string | null> {
  const { data: venue } = await admin.from('venues').select('booking_model').eq('id', venueId).maybeSingle();
  const bookingModel = (venue as { booking_model?: string } | null)?.booking_model;

  if (bookingModel === 'unified_scheduling') {
    const ids = await getStaffManagedCalendarIds(admin, venueId, staffId);
    return ids[0] ?? null;
  }

  const { data, error } = await admin
    .from('practitioners')
    .select('id')
    .eq('venue_id', venueId)
    .eq('staff_id', staffId)
    .maybeSingle();

  if (error) {
    console.error('[getLinkedPractitionerId] practitioners lookup failed:', error.message, { venueId, staffId });
    return null;
  }

  return data?.id ?? null;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import type { VenueStaff } from '@/lib/venue-auth';
import { OUTSIDE_ASSIGNED_CALENDARS_ERROR, requireManagedCalendarAccess } from '@/lib/venue-auth';
import { resolveInstructorCalendarIdForClass } from '@/lib/class-instances/instructor-calendar-block';

/**
 * Whether the current user may manage sessions/timetable for a class type (admin always; staff only if
 * the class is allocated to a team calendar column they manage).
 */
export async function staffMayManageClassTypeSessions(
  admin: SupabaseClient,
  venueId: string,
  staff: Pick<VenueStaff, 'id' | 'role'>,
  classTypeId: string,
): Promise<
  | { ok: true; resolvedHostCalendarId: string | null }
  | { ok: false; error: string; status: 403 | 404 }
> {
  if (staff.role === 'admin') {
    return { ok: true, resolvedHostCalendarId: null };
  }

  const { data: ct, error } = await admin
    .from('class_types')
    .select('id, instructor_id')
    .eq('id', classTypeId)
    .eq('venue_id', venueId)
    .maybeSingle();

  if (error || !ct) {
    return { ok: false, error: 'Class type not found', status: 404 };
  }

  const instructorId = (ct as { instructor_id: string | null }).instructor_id;
  if (!instructorId) {
    return {
      ok: false,
      error: 'This class is not assigned to a calendar.',
      status: 403,
    };
  }

  const resolved = await resolveInstructorCalendarIdForClass(admin, venueId, instructorId);
  if (!resolved) {
    return {
      ok: false,
      error: 'Could not resolve the calendar for this class. Ask an admin to check the class setup.',
      status: 403,
    };
  }

  const access = await requireManagedCalendarAccess(
    admin,
    venueId,
    staff,
    resolved,
    OUTSIDE_ASSIGNED_CALENDARS_ERROR,
  );
  if (!access.ok) {
    return { ok: false, error: access.error, status: 403 };
  }

  return { ok: true, resolvedHostCalendarId: resolved };
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bookable calendar IDs (`unified_calendars.id`) and/or legacy `practitioners.id` this staff user may use.
 * - Unified Scheduling: junction + `unified_calendars.staff_id` (calendar UUIDs only).
 * - Other models: same calendars plus legacy `practitioners.id` when present (same shape the class timetable
 *   instructor dropdown uses).
 */
export async function getStaffManagedCalendarIds(
  admin: SupabaseClient,
  venueId: string,
  staffId: string,
): Promise<string[]> {
  const { data: venue } = await admin.from('venues').select('booking_model').eq('id', venueId).maybeSingle();
  const bookingModel = (venue as { booking_model?: string } | null)?.booking_model;

  const merged = new Set<string>();

  const { data: junctionRows, error: jErr } = await admin
    .from('staff_calendar_assignments')
    .select('calendar_id')
    .eq('venue_id', venueId)
    .eq('staff_id', staffId);

  if (jErr) {
    console.error('[getStaffManagedCalendarIds] staff_calendar_assignments failed:', jErr.message, {
      venueId,
      staffId,
    });
  } else {
    for (const r of junctionRows ?? []) {
      merged.add((r as { calendar_id: string }).calendar_id);
    }
  }

  /** Calendars linked via legacy `unified_calendars.staff_id` (before or alongside junction rows). */
  const { data: legacyRows, error: legacyErr } = await admin
    .from('unified_calendars')
    .select('id')
    .eq('venue_id', venueId)
    .eq('staff_id', staffId)
    .eq('is_active', true)
    .neq('calendar_type', 'resource');

  if (legacyErr) {
    console.error('[getStaffManagedCalendarIds] unified_calendars.staff_id failed:', legacyErr.message, {
      venueId,
      staffId,
    });
  } else {
    for (const r of legacyRows ?? []) {
      merged.add((r as { id: string }).id);
    }
  }

  /** Legacy appointment model: staff still has a practitioners row (used by older UIs and class instructor pickers). */
  if (bookingModel !== 'unified_scheduling') {
    const { data: prRow, error: pErr } = await admin
      .from('practitioners')
      .select('id')
      .eq('venue_id', venueId)
      .eq('staff_id', staffId)
      .maybeSingle();

    if (pErr) {
      console.error('[getStaffManagedCalendarIds] practitioners failed:', pErr.message, { venueId, staffId });
    } else if (prRow?.id) {
      merged.add((prRow as { id: string }).id);
    }
  }

  return [...merged];
}

export async function staffManagesCalendar(
  admin: SupabaseClient,
  venueId: string,
  staffId: string,
  calendarId: string,
): Promise<boolean> {
  const ids = await getStaffManagedCalendarIds(admin, venueId, staffId);
  return ids.includes(calendarId);
}

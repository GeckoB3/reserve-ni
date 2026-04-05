import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Bookable calendar IDs (`unified_calendars.id`) this staff user may manage for unified scheduling.
 * Legacy appointment venues use a single `practitioners` row per staff.
 */
export async function getStaffManagedCalendarIds(
  admin: SupabaseClient,
  venueId: string,
  staffId: string,
): Promise<string[]> {
  const { data: venue } = await admin.from('venues').select('booking_model').eq('id', venueId).maybeSingle();
  const bookingModel = (venue as { booking_model?: string } | null)?.booking_model;

  if (bookingModel === 'unified_scheduling') {
    const { data, error } = await admin
      .from('staff_calendar_assignments')
      .select('calendar_id')
      .eq('venue_id', venueId)
      .eq('staff_id', staffId);

    if (error) {
      console.error('[getStaffManagedCalendarIds] unified junction failed:', error.message, { venueId, staffId });
      return [];
    }
    return (data ?? []).map((r) => r.calendar_id as string);
  }

  const { data, error } = await admin
    .from('practitioners')
    .select('id')
    .eq('venue_id', venueId)
    .eq('staff_id', staffId)
    .maybeSingle();

  if (error) {
    console.error('[getStaffManagedCalendarIds] legacy practitioners failed:', error.message, { venueId, staffId });
    return [];
  }

  return data?.id ? [data.id] : [];
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

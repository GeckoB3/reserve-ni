import type { SupabaseClient } from '@supabase/supabase-js';

export interface BookingCalendarScopeRow {
  calendar_id?: string | null;
  practitioner_id?: string | null;
  resource_id?: string | null;
  experience_event_id?: string | null;
  class_instance_id?: string | null;
}

export async function resolveBookingScopedCalendarId(
  admin: SupabaseClient,
  venueId: string,
  booking: BookingCalendarScopeRow,
): Promise<string | null> {
  if (booking.calendar_id) return booking.calendar_id;
  if (booking.practitioner_id) return booking.practitioner_id;

  if (booking.resource_id) {
    const { data } = await admin
      .from('unified_calendars')
      .select('display_on_calendar_id')
      .eq('id', booking.resource_id)
      .eq('venue_id', venueId)
      .maybeSingle();
    return (data?.display_on_calendar_id as string | null | undefined) ?? null;
  }

  if (booking.experience_event_id) {
    const { data } = await admin
      .from('experience_events')
      .select('calendar_id')
      .eq('id', booking.experience_event_id)
      .eq('venue_id', venueId)
      .maybeSingle();
    return (data?.calendar_id as string | null | undefined) ?? null;
  }

  if (booking.class_instance_id) {
    const { data } = await admin
      .from('class_instances')
      .select('class_type:class_types(instructor_id)')
      .eq('id', booking.class_instance_id)
      .maybeSingle();
    const classType = data?.class_type as { instructor_id?: string | null } | { instructor_id?: string | null }[] | null | undefined;
    if (Array.isArray(classType)) {
      return classType[0]?.instructor_id ?? null;
    }
    return classType?.instructor_id ?? null;
  }

  return null;
}

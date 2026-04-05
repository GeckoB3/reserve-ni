import { randomUUID } from 'crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { defaultNewUnifiedCalendarWorkingHours } from '@/lib/availability/practitioner-defaults';
import { checkCalendarLimit } from '@/lib/tier-enforcement';

/**
 * Creates a new team (practitioner) unified calendar row for hosting an experience event column.
 */
export async function createTeamCalendarForEvent(
  admin: SupabaseClient,
  venueId: string,
  name: string,
): Promise<{ ok: true; id: string } | { ok: false; error: string; status: number }> {
  const limitCheck = await checkCalendarLimit(venueId, 'practitioners');
  if (!limitCheck.allowed) {
    return {
      ok: false,
      error: `Calendar limit reached (${limitCheck.current ?? '?'} of ${limitCheck.limit ?? '?'})`,
      status: 403,
    };
  }
  const calendarId = randomUUID();
  const { data, error } = await admin
    .from('unified_calendars')
    .insert({
      id: calendarId,
      venue_id: venueId,
      name: name.trim(),
      staff_id: null,
      slug: null,
      working_hours: defaultNewUnifiedCalendarWorkingHours(),
      break_times: [],
      break_times_by_day: null,
      days_off: [],
      sort_order: 0,
      is_active: true,
      colour: '#F59E0B',
      calendar_type: 'practitioner',
    })
    .select('id')
    .single();

  if (error || !data) {
    console.error('[createTeamCalendarForEvent]', error?.message);
    return { ok: false, error: 'Failed to create calendar', status: 500 };
  }
  return { ok: true, id: (data as { id: string }).id };
}

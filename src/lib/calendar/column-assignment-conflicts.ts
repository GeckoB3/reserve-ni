/**
 * Column-level scheduling checks for team calendars (`unified_calendars` with calendar_type = practitioner).
 *
 * **Appointment services** (`calendar_service_assignments`) may be linked to any combination of calendars; each
 * column’s bookings are independent.
 *
 * **Each** class type, resource, and ticketed event row is assigned to at most **one** team calendar at a time (moving it
 * replaces the previous assignment). **Many** class types can share the same column; sessions must not overlap in time on
 * that column.
 *
 * A single column may host appointments, multiple class types, ticketed events, and resources on that host. Conflicts at
 * **specific times** are enforced when creating bookings, class instances, or events (see
 * `calendar-event-window-conflicts`, resource/appointment engines).
 *
 * This module only flags **configuration** conflicts: **two or more resources** on the same host calendar whose
 * **weekly availability windows overlap** (guests could get competing slot offers). The resources API also blocks
 * assigning a resource when its weekly hours overlap scheduled classes, bookings, or ticketed events on that host column
 * (`resource-host-calendar-conflicts`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { WorkingHours } from '@/types/booking-models';
import { weeklyResourceAvailabilityOverlaps } from '@/lib/booking/resource-weekly-overlap';

async function listResourcesOnHostCalendar(
  admin: SupabaseClient,
  venueId: string,
  hostCalendarId: string,
): Promise<Array<{ id: string; name: string; working_hours: WorkingHours }>> {
  const { data, error } = await admin
    .from('unified_calendars')
    .select('id, name, working_hours')
    .eq('venue_id', venueId)
    .eq('calendar_type', 'resource')
    .eq('display_on_calendar_id', hostCalendarId);

  if (error) {
    console.error('[listResourcesOnHostCalendar]', error.message);
    return [];
  }
  return (data ?? []).map((r) => ({
    id: (r as { id: string }).id,
    name: (r as { name: string }).name,
    working_hours: ((r as { working_hours?: WorkingHours }).working_hours ?? {}) as WorkingHours,
  }));
}

function pairwiseResourceOverlapMessages(
  resources: Array<{ id: string; name: string; working_hours: WorkingHours }>,
): string[] {
  const msgs: string[] = [];
  for (let i = 0; i < resources.length; i++) {
    for (let j = i + 1; j < resources.length; j++) {
      const a = resources[i]!;
      const b = resources[j]!;
      if (weeklyResourceAvailabilityOverlaps(a.working_hours, b.working_hours)) {
        msgs.push(
          `Resources “${a.name}” and “${b.name}” have overlapping weekly hours on this column. Adjust availability or move one resource to another calendar.`,
        );
      }
    }
  }
  return msgs;
}

export interface CalendarColumnConflict {
  calendar_id: string;
  calendar_name: string;
  messages: string[];
}

/**
 * Team calendars that have two+ resources with overlapping weekly hours on the same host column.
 */
export async function collectCalendarColumnConflicts(
  admin: SupabaseClient,
  venueId: string,
): Promise<CalendarColumnConflict[]> {
  const { data: teamRows, error: teamErr } = await admin
    .from('unified_calendars')
    .select('id, name')
    .eq('venue_id', venueId)
    .eq('calendar_type', 'practitioner')
    .order('sort_order', { ascending: true });

  if (teamErr) {
    console.error('[collectCalendarColumnConflicts] unified_calendars', teamErr.message);
    return [];
  }

  const out: CalendarColumnConflict[] = [];

  for (const row of teamRows ?? []) {
    const calendarId = (row as { id: string }).id;
    const calendarName = (row as { name: string }).name;
    const resourcesOnHost = await listResourcesOnHostCalendar(admin, venueId, calendarId);
    const messages = pairwiseResourceOverlapMessages(resourcesOnHost);

    if (messages.length > 0) {
      out.push({ calendar_id: calendarId, calendar_name: calendarName, messages });
    }
  }

  return out;
}

import type { SupabaseClient } from '@supabase/supabase-js';

/** Normalise DB time to HH:MM:SS for Postgres `time`. */
function normalizeTimeForDb(t: string): string {
  const s = t.trim();
  if (s.length === 5) return `${s}:00`;
  if (s.length >= 8) return s.slice(0, 8);
  return `${s}:00`;
}

/** End time same calendar day; caps at 23:59:00 if duration would cross midnight. */
export function classBlockEndTime(startTime: string, durationMinutes: number): string {
  const norm = normalizeTimeForDb(startTime);
  const [h, m] = norm.slice(0, 8).split(':').map((x) => parseInt(x, 10));
  const startMins = h * 60 + m;
  const endMins = Math.min(startMins + durationMinutes, 24 * 60 - 1);
  const eh = Math.floor(endMins / 60);
  const em = endMins % 60;
  return `${String(eh).padStart(2, '0')}:${String(em).padStart(2, '0')}:00`;
}

/**
 * Map class_types.instructor_id (unified_calendar id or legacy practitioner id) to a bookable calendar id.
 */
export async function resolveInstructorCalendarIdForClass(
  admin: SupabaseClient,
  venueId: string,
  instructorId: string | null,
): Promise<string | null> {
  if (!instructorId) return null;

  const { data: uc } = await admin
    .from('unified_calendars')
    .select('id')
    .eq('venue_id', venueId)
    .eq('id', instructorId)
    .maybeSingle();
  if (uc) return (uc as { id: string }).id;

  const { data: pr } = await admin
    .from('practitioners')
    .select('staff_id')
    .eq('venue_id', venueId)
    .eq('id', instructorId)
    .maybeSingle();
  const staffId = pr ? (pr as { staff_id?: string | null }).staff_id : null;
  if (!staffId) return null;

  const { data: ucByStaff } = await admin
    .from('unified_calendars')
    .select('id')
    .eq('venue_id', venueId)
    .eq('staff_id', staffId)
    .eq('is_active', true)
    .maybeSingle();
  return ucByStaff ? (ucByStaff as { id: string }).id : null;
}

export interface SyncClassInstanceCalendarBlockParams {
  venueId: string;
  classInstanceId: string;
  instanceDate: string;
  startTime: string;
  classTypeId: string;
  /** When true, remove any teaching block only (instance row may remain cancelled). */
  skipBlock: boolean;
  createdByStaffId?: string | null;
}

/**
 * Class sessions render on the instructor’s calendar column from the schedule feed (GET /api/venue/schedule),
 * not as `calendar_blocks` overlays. This only removes any legacy teaching block for the instance.
 */
export async function syncCalendarBlockForClassInstance(
  admin: SupabaseClient,
  params: SyncClassInstanceCalendarBlockParams,
): Promise<void> {
  const { error: delErr } = await admin.from('calendar_blocks').delete().eq('class_instance_id', params.classInstanceId);
  if (delErr) {
    console.error('[syncCalendarBlockForClassInstance] delete existing:', delErr.message);
  }
  void params.skipBlock;
}

/** Remove teaching block when a class instance is cancelled or rescheduled away. */
export async function removeCalendarBlockForClassInstance(
  admin: SupabaseClient,
  classInstanceId: string,
): Promise<void> {
  const { error } = await admin.from('calendar_blocks').delete().eq('class_instance_id', classInstanceId);
  if (error) {
    console.error('[removeCalendarBlockForClassInstance]', error.message, { classInstanceId });
  }
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { normalizeTimeForDb, validateMergedEventTimes } from '@/lib/experience-events/experience-event-validation';

export { normalizeTimeForDb, validateStartEndTimes } from '@/lib/experience-events/experience-event-validation';

/**
 * Counts bookings that should block hard-deleting an experience event (any non-cancelled row).
 */
export async function countBookingsBlockingEventDelete(
  admin: SupabaseClient,
  venueId: string,
  experienceEventId: string,
): Promise<number> {
  const { count, error } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('experience_event_id', experienceEventId)
    .neq('status', 'Cancelled');

  if (error) {
    console.error('[countBookingsBlockingEventDelete]', error);
    return -1;
  }
  return count ?? 0;
}

export async function assertExperienceEventDeletable(
  admin: SupabaseClient,
  venueId: string,
  experienceEventId: string,
): Promise<{ ok: true } | { ok: false; error: string; booking_count: number }> {
  const n = await countBookingsBlockingEventDelete(admin, venueId, experienceEventId);
  if (n < 0) {
    return { ok: false, error: 'Could not verify bookings for this event', booking_count: 0 };
  }
  if (n > 0) {
    return {
      ok: false,
      error:
        'This event has active or past bookings. Cancel the event (to notify guests and refund where applicable) or cancel individual bookings before deleting the event row.',
      booking_count: n,
    };
  }
  return { ok: true };
}

export interface ExperienceEventPatchInput {
  name?: string;
  description?: string | null;
  event_date?: string;
  start_time?: string;
  end_time?: string;
  capacity?: number;
  image_url?: string | null;
  is_recurring?: boolean;
  recurrence_rule?: string | null;
  parent_event_id?: string | null;
  is_active?: boolean;
  /** Unified calendar column; null clears assignment. */
  calendar_id?: string | null;
}

/**
 * Validates merged times when either time changes; normalises start/end to `HH:MM`+`:00` for Postgres.
 */
export async function resolveExperienceEventPatch(
  admin: SupabaseClient,
  venueId: string,
  eventId: string,
  patch: ExperienceEventPatchInput,
): Promise<
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; error: string }
> {
  const hasStart = patch.start_time !== undefined;
  const hasEnd = patch.end_time !== undefined;

  let existingStart: string | null | undefined;
  let existingEnd: string | null | undefined;

  if (hasStart || hasEnd) {
    if (hasStart !== hasEnd) {
      const { data: row, error } = await admin
        .from('experience_events')
        .select('start_time,end_time')
        .eq('id', eventId)
        .eq('venue_id', venueId)
        .maybeSingle();

      if (error || !row) {
        return { ok: false, error: 'Event not found' };
      }
      existingStart = (row as { start_time?: string }).start_time ?? null;
      existingEnd = (row as { end_time?: string }).end_time ?? null;
    }

    const timeErr = validateMergedEventTimes(existingStart, existingEnd, {
      start_time: patch.start_time,
      end_time: patch.end_time,
    });
    if (timeErr) return { ok: false, error: timeErr };
  }

  const payload: Record<string, unknown> = { ...patch };
  if (payload.start_time !== undefined) {
    payload.start_time = normalizeTimeForDb(String(payload.start_time));
  }
  if (payload.end_time !== undefined) {
    payload.end_time = normalizeTimeForDb(String(payload.end_time));
  }

  return { ok: true, payload };
}

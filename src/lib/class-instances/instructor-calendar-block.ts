import type { SupabaseClient } from '@supabase/supabase-js';
import { getStaffManagedCalendarIds } from '@/lib/staff-calendar-access';

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

const MAX_RESOURCE_HOST_HOPS = 5;

/**
 * Legacy venues may have `practitioners` rows without a matching `unified_calendars` row (same id).
 * Class scheduling and conflict checks require a unified row; mirror the practitioner once.
 */
export async function ensureUnifiedMirrorForPractitionerId(
  admin: SupabaseClient,
  venueId: string,
  pr: {
    id: string;
    name: string;
    staff_id?: string | null;
    slug?: string | null;
    working_hours?: unknown;
    break_times?: unknown;
    break_times_by_day?: unknown;
    days_off?: unknown;
    sort_order?: number;
    is_active?: boolean;
  },
): Promise<string | null> {
  const { data: exists } = await admin
    .from('unified_calendars')
    .select('id')
    .eq('id', pr.id)
    .eq('venue_id', venueId)
    .maybeSingle();
  if (exists) {
    return (exists as { id: string }).id;
  }

  const { error } = await admin.from('unified_calendars').insert({
    id: pr.id,
    venue_id: venueId,
    name: pr.name,
    staff_id: pr.staff_id ?? null,
    slug: pr.slug ?? null,
    working_hours: pr.working_hours ?? {},
    break_times: pr.break_times ?? [],
    break_times_by_day: pr.break_times_by_day ?? null,
    days_off: pr.days_off ?? [],
    sort_order: typeof pr.sort_order === 'number' ? pr.sort_order : 0,
    is_active: pr.is_active !== false,
    colour: '#3B82F6',
    calendar_type: 'practitioner',
  });

  if (error) {
    console.error('[ensureUnifiedMirrorForPractitionerId]', error.message, { id: pr.id, venueId });
    return null;
  }
  return pr.id;
}

/**
 * Map `class_types.instructor_id` (unified calendar column id or legacy `practitioners.id`) to the
 * **host** team calendar column id used for schedule placement and conflict checks.
 *
 * - Independent calendar columns (`staff_id` may be null) resolve by id + venue.
 * - If the stored id is a **resource** row, we follow `display_on_calendar_id` to the host column (chain-capped).
 * - Legacy rows may still store a practitioner id; those resolve via staff-managed calendars.
 */
export async function resolveInstructorCalendarIdForClass(
  admin: SupabaseClient,
  venueId: string,
  instructorId: string | null,
): Promise<string | null> {
  if (!instructorId) return null;

  const id = instructorId.trim();
  if (!id) return null;

  /** 1) Prefer unified_calendars: lookup by primary key, then verify venue (more reliable than id+venue in one filter). */
  let currentId: string | null = id;
  for (let hop = 0; hop < MAX_RESOURCE_HOST_HOPS && currentId; hop++) {
    const { data: ucRow, error: ucErr } = await admin
      .from('unified_calendars')
      .select('id, venue_id, calendar_type, display_on_calendar_id')
      .eq('id', currentId)
      .maybeSingle();

    if (ucErr) {
      console.error('[resolveInstructorCalendarIdForClass] unified_calendars by id:', ucErr.message, {
        currentId,
      });
      break;
    }
    if (!ucRow) break;

    const uc = ucRow as {
      id: string;
      venue_id: string;
      calendar_type: string;
      display_on_calendar_id: string | null;
    };
    if (uc.venue_id !== venueId) {
      console.error('[resolveInstructorCalendarIdForClass] venue mismatch', {
        id: currentId,
        venueId,
        rowVenue: uc.venue_id,
      });
      return null;
    }
    if (uc.calendar_type === 'resource') {
      const parent = uc.display_on_calendar_id?.trim() ?? '';
      if (!parent) return null;
      currentId = parent;
      continue;
    }
    return uc.id;
  }

  /** 2) Legacy practitioners.id — mirror into unified_calendars if missing, then staff → calendar(s). */
  const { data: pr } = await admin
    .from('practitioners')
    .select(
      'id, name, staff_id, slug, working_hours, break_times, break_times_by_day, days_off, sort_order, is_active',
    )
    .eq('venue_id', venueId)
    .eq('id', id)
    .maybeSingle();

  if (!pr) {
    return null;
  }

  const pRow = pr as {
    id: string;
    name: string;
    staff_id?: string | null;
    slug?: string | null;
    working_hours?: unknown;
    break_times?: unknown;
    break_times_by_day?: unknown;
    days_off?: unknown;
    sort_order?: number;
    is_active?: boolean;
  };
  const staffId = pRow.staff_id ?? null;

  if (!staffId) {
    return ensureUnifiedMirrorForPractitionerId(admin, venueId, pRow);
  }

  const managed = await getStaffManagedCalendarIds(admin, venueId, staffId);

  /**
   * 3) `managed` is normally unified_calendar UUIDs (junction + legacy staff_id on calendar).
   * For practitioner_appointment venues, getStaffManagedCalendarIds returns [practitioners.id] instead,
   * so `.in('id', managed)` matches no unified row — fall through to (4).
   */
  if (managed.length > 0) {
    const { data: ucRows } = await admin
      .from('unified_calendars')
      .select('id')
      .eq('venue_id', venueId)
      .in('id', managed)
      .eq('is_active', true)
      .neq('calendar_type', 'resource')
      .order('sort_order', { ascending: true })
      .limit(1);
    const first = ucRows?.[0] as { id: string } | undefined;
    if (first) return first.id;
  }

  /** 4) Any active team column linked to this staff (covers legacy appointment model + staff_id-only calendars). */
  const { data: byStaff } = await admin
    .from('unified_calendars')
    .select('id')
    .eq('venue_id', venueId)
    .eq('staff_id', staffId)
    .eq('is_active', true)
    .neq('calendar_type', 'resource')
    .order('sort_order', { ascending: true })
    .limit(1);
  const fromStaff = byStaff?.[0] as { id: string } | undefined;
  return fromStaff?.id ?? null;
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

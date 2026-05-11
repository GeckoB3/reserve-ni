import type { SupabaseClient } from '@supabase/supabase-js';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';

/**
 * Generic fallback message used when a hard-delete is blocked by upcoming active bookings but
 * the caller has not yet adopted the per-entity helpers below. Prefer the entity-specific
 * `buildUpcomingBookingsBlockMessage` helper when responding from a route, so the toast / modal
 * can include the count and a friendlier label (e.g. "this class", "this event").
 */
export const UPCOMING_ACTIVE_BOOKINGS_BLOCK_DELETE =
  'There are upcoming active bookings linked to this item. Cancel or reschedule them before deleting it.';

export type DeletableEntityKind =
  | 'service'
  | 'class'
  | 'class_session'
  | 'class_schedule'
  | 'event'
  | 'resource';

const ENTITY_LABELS: Record<DeletableEntityKind, string> = {
  service: 'this service',
  class: 'this class',
  class_session: 'this session',
  class_schedule: 'this schedule entry',
  event: 'this event',
  resource: 'this resource',
};

/**
 * Builds a user-facing message explaining that a delete was blocked because upcoming active
 * bookings are still linked to the entity. When the count is known we include it so the operator
 * understands how many guests need to be handled before retrying.
 */
export function buildUpcomingBookingsBlockMessage(
  kind: DeletableEntityKind,
  bookingCount: number,
): string {
  const label = ENTITY_LABELS[kind];
  if (bookingCount > 0) {
    const noun = bookingCount === 1 ? 'upcoming active booking' : 'upcoming active bookings';
    return `Can't delete ${label}: there ${bookingCount === 1 ? 'is' : 'are'} ${bookingCount} ${noun} linked to it. Cancel or reschedule ${bookingCount === 1 ? 'it' : 'them'} first, then try again.`;
  }
  return `Can't delete ${label} while it has upcoming active bookings. Cancel or reschedule them first, then try again.`;
}

interface GuardResult {
  blocked: boolean;
  /** Number of bookings blocking the delete. -1 when the count could not be determined. */
  bookingCount: number;
  /** Set when the count query failed; treated as "blocked" by callers to avoid orphaning data. */
  error?: string;
}

function todayIsoDateUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Counts upcoming active bookings for a `bookings.X = id` filter. Used by the per-entity
 * helpers below so they share the same shape and date semantics.
 */
async function countUpcomingActiveBookingsBy(
  admin: SupabaseClient,
  venueId: string,
  column: 'service_id' | 'service_item_id' | 'appointment_service_id' | 'resource_id',
  value: string,
): Promise<GuardResult> {
  const today = todayIsoDateUtc();
  const { count, error } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq(column, value)
    .gte('booking_date', today)
    .in('status', [...BOOKING_ACTIVE_STATUSES]);

  if (error) {
    console.error(`countUpcomingActiveBookingsBy(${column}):`, error.message);
    return { blocked: true, bookingCount: -1, error: 'Could not verify existing bookings.' };
  }
  const n = count ?? 0;
  return { blocked: n > 0, bookingCount: n };
}

export async function hasUpcomingActiveBookingsForVenueServiceItem(
  admin: SupabaseClient,
  venueId: string,
  serviceItemId: string,
): Promise<GuardResult> {
  return countUpcomingActiveBookingsBy(admin, venueId, 'service_item_id', serviceItemId);
}

export async function hasUpcomingActiveBookingsForVenueAppointmentService(
  admin: SupabaseClient,
  venueId: string,
  appointmentServiceId: string,
): Promise<GuardResult> {
  return countUpcomingActiveBookingsBy(admin, venueId, 'appointment_service_id', appointmentServiceId);
}

export async function hasUpcomingActiveBookingsForVenueResource(
  admin: SupabaseClient,
  venueId: string,
  resourceUnifiedCalendarId: string,
): Promise<GuardResult> {
  return countUpcomingActiveBookingsBy(admin, venueId, 'resource_id', resourceUnifiedCalendarId);
}

/**
 * Table-reservation service (`venue_services`). The bookings table FK is `ON DELETE SET NULL`, so
 * without this guard the platform would silently strip the service link from history rows.
 */
export async function hasUpcomingActiveBookingsForVenueService(
  admin: SupabaseClient,
  venueId: string,
  venueServiceId: string,
): Promise<GuardResult> {
  return countUpcomingActiveBookingsBy(admin, venueId, 'service_id', venueServiceId);
}

/** Class type: any active booking tied to a non-cancelled instance on or after today. */
export async function hasUpcomingActiveBookingsForClassType(
  admin: SupabaseClient,
  venueId: string,
  classTypeId: string,
): Promise<GuardResult> {
  const today = todayIsoDateUtc();
  const { data: instances, error: instErr } = await admin
    .from('class_instances')
    .select('id')
    .eq('class_type_id', classTypeId)
    .eq('is_cancelled', false)
    .gte('instance_date', today);

  if (instErr) {
    console.error('hasUpcomingActiveBookingsForClassType (instances):', instErr.message);
    return { blocked: true, bookingCount: -1, error: 'Could not verify class sessions.' };
  }
  const ids = (instances ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return { blocked: false, bookingCount: 0 };

  const { count, error } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .in('class_instance_id', ids)
    .in('status', [...BOOKING_ACTIVE_STATUSES]);

  if (error) {
    console.error('hasUpcomingActiveBookingsForClassType (bookings):', error.message);
    return { blocked: true, bookingCount: -1, error: 'Could not verify existing bookings.' };
  }
  const n = count ?? 0;
  return { blocked: n > 0, bookingCount: n };
}

/** Single class instance: active bookings for this session (any date — avoids orphaning live rows). */
export async function hasActiveBookingsForClassInstance(
  admin: SupabaseClient,
  venueId: string,
  classInstanceId: string,
): Promise<GuardResult> {
  const { count, error } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('class_instance_id', classInstanceId)
    .in('status', [...BOOKING_ACTIVE_STATUSES]);

  if (error) {
    console.error('hasActiveBookingsForClassInstance:', error.message);
    return { blocked: true, bookingCount: -1, error: 'Could not verify existing bookings.' };
  }
  const n = count ?? 0;
  return { blocked: n > 0, bookingCount: n };
}

/** Timetable row: block delete while future sessions from this rule still have active bookings. */
export async function hasUpcomingActiveBookingsForClassTimetableEntry(
  admin: SupabaseClient,
  venueId: string,
  timetableEntryId: string,
): Promise<GuardResult> {
  const today = todayIsoDateUtc();
  const { data: instances, error: instErr } = await admin
    .from('class_instances')
    .select('id')
    .eq('timetable_entry_id', timetableEntryId)
    .eq('is_cancelled', false)
    .gte('instance_date', today);

  if (instErr) {
    console.error('hasUpcomingActiveBookingsForClassTimetableEntry (instances):', instErr.message);
    return { blocked: true, bookingCount: -1, error: 'Could not verify class sessions.' };
  }
  const ids = (instances ?? []).map((r) => (r as { id: string }).id);
  if (ids.length === 0) return { blocked: false, bookingCount: 0 };

  const { count, error } = await admin
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .in('class_instance_id', ids)
    .in('status', [...BOOKING_ACTIVE_STATUSES]);

  if (error) {
    console.error('hasUpcomingActiveBookingsForClassTimetableEntry (bookings):', error.message);
    return { blocked: true, bookingCount: -1, error: 'Could not verify existing bookings.' };
  }
  const n = count ?? 0;
  return { blocked: n > 0, bookingCount: n };
}

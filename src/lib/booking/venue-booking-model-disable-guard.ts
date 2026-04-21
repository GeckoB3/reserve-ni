import type { BookingModel } from '@/types/booking-models';
import type { SupabaseClient } from '@supabase/supabase-js';
import { formatYmdInTimezone, venueLocalDateTimeToUtcMs } from '@/lib/venue/venue-local-clock';

const TERMINAL_STATUSES = new Set(['Cancelled', 'Completed', 'No-Show']);

/** DB enum values that map to the same canonical model as `unified_scheduling`. */
function dbValuesForCanonicalModel(model: BookingModel): string[] {
  if (model === 'unified_scheduling') {
    return ['unified_scheduling', 'practitioner_appointment'];
  }
  return [model];
}

function rowBookingModelToCanonical(raw: string): BookingModel | null {
  if (raw === 'practitioner_appointment') return 'unified_scheduling';
  const allowed: BookingModel[] = [
    'table_reservation',
    'unified_scheduling',
    'event_ticket',
    'class_session',
    'resource_booking',
  ];
  return (allowed as string[]).includes(raw) ? (raw as BookingModel) : null;
}

const MODEL_LABEL: Partial<Record<BookingModel, string>> = {
  table_reservation: 'Table reservations',
  unified_scheduling: 'Appointments',
  event_ticket: 'Ticketed events',
  class_session: 'Classes',
  resource_booking: 'Resource bookings',
};

/**
 * If the venue is removing one or more active booking models, ensure there are no
 * upcoming (venue-local) bookings in a non-terminal status for any removed model.
 */
export async function assertCanDisableBookingModels(
  db: SupabaseClient,
  venueId: string,
  venueTimezone: string | null | undefined,
  removedModels: BookingModel[],
): Promise<void> {
  if (removedModels.length === 0) return;

  const tz = (typeof venueTimezone === 'string' && venueTimezone.trim() !== ''
    ? venueTimezone
    : 'Europe/London') as string;
  const nowMs = Date.now();
  const todayYmd = formatYmdInTimezone(nowMs, tz);

  const dbValues = [...new Set(removedModels.flatMap(dbValuesForCanonicalModel))];

  const { data: rows, error } = await db
    .from('bookings')
    .select('booking_date, booking_time, booking_model, status')
    .eq('venue_id', venueId)
    .in('booking_model', dbValues)
    .gte('booking_date', todayYmd);

  if (error) {
    throw new Error(error.message);
  }

  for (const row of rows ?? []) {
    const st = typeof row.status === 'string' ? row.status : '';
    if (TERMINAL_STATUSES.has(st)) continue;

    const dateStr = row.booking_date as string;
    const timeRaw = row.booking_time as string;
    const timeHm = timeRaw.length >= 5 ? timeRaw.slice(0, 5) : timeRaw;
    const startMs = venueLocalDateTimeToUtcMs(dateStr, timeHm, tz);
    if (startMs < nowMs) continue;

    const canonical = rowBookingModelToCanonical(String(row.booking_model));
    if (canonical && removedModels.includes(canonical)) {
      const label = MODEL_LABEL[canonical] ?? canonical.replace(/_/g, ' ');
      const err = new Error(
        `${label} cannot be turned off while you have upcoming bookings of that type. ` +
          'Cancel or complete those bookings first, then try again.',
      );
      (err as Error & { code?: string }).code = 'BOOKING_MODEL_HAS_FUTURE_BOOKINGS';
      throw err;
    }
  }
}

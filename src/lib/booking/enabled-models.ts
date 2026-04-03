import type { BookingModel } from '@/types/booking-models';

/** Enum order for stable secondary ordering and merged nav. */
export const BOOKING_MODEL_ORDER: BookingModel[] = [
  'table_reservation',
  'practitioner_appointment',
  'unified_scheduling',
  'event_ticket',
  'class_session',
  'resource_booking',
];

const ALL_BOOKING_MODELS = new Set<string>(BOOKING_MODEL_ORDER);

/** v1: only C/D/E may appear as secondaries (see ReserveNI_Unified_Booking_Functionality.md). */
const SECONDARY_ALLOWLIST = new Set<BookingModel>(['event_ticket', 'class_session', 'resource_booking']);

function isBookingModelString(s: string): s is BookingModel {
  return ALL_BOOKING_MODELS.has(s);
}

/**
 * Parses `venues.enabled_models` JSONB: valid secondaries only, no dupes, no repeat of primary,
 * sorted by BOOKING_MODEL_ORDER.
 */
export function normalizeEnabledModels(raw: unknown, primary: BookingModel): BookingModel[] {
  if (!Array.isArray(raw)) return [];

  const seen = new Set<string>();
  const out: BookingModel[] = [];

  for (const el of raw) {
    if (typeof el !== 'string' || !isBookingModelString(el)) continue;
    if (el === primary) continue;
    if (el === 'table_reservation') continue;
    if (!SECONDARY_ALLOWLIST.has(el)) continue;
    if (seen.has(el)) continue;
    seen.add(el);
    out.push(el);
  }

  out.sort((a, b) => BOOKING_MODEL_ORDER.indexOf(a) - BOOKING_MODEL_ORDER.indexOf(b));
  return out;
}

export function venueExposesBookingModel(
  primary: BookingModel,
  enabledModels: BookingModel[],
  model: BookingModel
): boolean {
  if (model === primary) return true;
  return enabledModels.includes(model);
}

/**
 * Primary model nav entries first, then each enabled secondary in array order (already sorted).
 * De-duplicates by `href` (first wins).
 */
const SECONDARY_ONLY: Array<Extract<BookingModel, 'event_ticket' | 'class_session' | 'resource_booking'>> = [
  'event_ticket',
  'class_session',
  'resource_booking',
];

/** Payload fields that imply a non–table-reservation booking (public create). */
export function hasNonTableBookingPayload(data: {
  experience_event_id?: string;
  ticket_lines?: { length: number } | undefined;
  class_instance_id?: string;
  resource_id?: string;
  booking_end_time?: string;
  event_session_id?: string;
  practitioner_id?: string;
  appointment_service_id?: string;
}): boolean {
  if (data.experience_event_id) return true;
  if (data.ticket_lines && data.ticket_lines.length > 0) return true;
  if (data.class_instance_id) return true;
  if (data.resource_id && data.booking_end_time) return true;
  if (data.event_session_id) return true;
  if (data.practitioner_id && data.appointment_service_id) return true;
  return false;
}

/**
 * When primary is `table_reservation`, infer C/D/E secondary from request body.
 * Returns null if ambiguous, invalid, or not enabled.
 */
export function inferSecondaryBookingModelFromPayload(
  data: {
    experience_event_id?: string;
    ticket_lines?: { length: number } | undefined;
    class_instance_id?: string;
    resource_id?: string;
    booking_end_time?: string;
  },
  enabledModels: BookingModel[]
): (typeof SECONDARY_ONLY)[number] | null {
  const hasEvent = Boolean(data.experience_event_id) || (data.ticket_lines != null && data.ticket_lines.length > 0);
  const hasClass = Boolean(data.class_instance_id);
  const hasResource = Boolean(data.resource_id && data.booking_end_time);
  const n = [hasEvent, hasClass, hasResource].filter(Boolean).length;
  if (n > 1) return null;
  if (hasEvent && enabledModels.includes('event_ticket')) return 'event_ticket';
  if (hasClass && enabledModels.includes('class_session')) return 'class_session';
  if (hasResource && enabledModels.includes('resource_booking')) return 'resource_booking';
  return null;
}

export function mergeModelNavEntries<T extends { href: string }>(
  itemsByModel: Partial<Record<BookingModel, T[]>>,
  primary: BookingModel,
  enabledModels: BookingModel[]
): T[] {
  const seen = new Set<string>();
  const out: T[] = [];

  const appendFor = (m: BookingModel) => {
    const items = itemsByModel[m];
    if (!items) return;
    for (const item of items) {
      if (seen.has(item.href)) continue;
      seen.add(item.href);
      out.push(item);
    }
  };

  appendFor(primary);
  for (const m of enabledModels) {
    if (m !== primary) appendFor(m);
  }
  return out;
}

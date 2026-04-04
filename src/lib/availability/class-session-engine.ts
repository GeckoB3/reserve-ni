/**
 * Model D: Class / group session availability engine.
 * Given class instances for a date + existing bookings,
 * returns remaining capacity per class instance.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { ClassPaymentRequirement, ClassType, ClassInstance } from '@/types/booking-models';
import { venueLocalDateTimeToUtcMs } from '@/lib/venue/venue-local-clock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Public / online booking: class start must be at or after reference time + min_notice_hours (venue-local wall time). */
export interface GuestClassBookingWindow {
  minNoticeHours: number;
  venueTimezone: string;
  /** For tests; defaults to `Date.now()` when omitted. */
  referenceNowMs?: number;
}

export interface ClassEngineInput {
  date: string;
  classTypes: ClassType[];
  instances: ClassInstance[];
  /** Total booked spots per class_instance_id. */
  bookedByInstance: Record<string, number>;
  /**
   * When set (public booking API), excludes instances that start in the past or inside the
   * venue’s minimum booking notice window (`venues.booking_rules.min_notice_hours`).
   */
  guestBookingWindow?: GuestClassBookingWindow;
  /** Resolved names for `class_types.instructor_id` (calendar or legacy practitioner) when `instructor_name` is empty. */
  instructorDisplayNamesById?: Record<string, string>;
}

export interface ClassAvailabilitySlot {
  instance_id: string;
  class_type_id: string;
  class_name: string;
  description: string | null;
  instance_date: string;
  start_time: string;
  duration_minutes: number;
  capacity: number;
  remaining: number;
  instructor_id: string | null;
  instructor_name: string | null;
  price_pence: number | null;
  /** Effective payment mode for this class type. */
  payment_requirement: ClassPaymentRequirement;
  /** Per-person deposit when payment_requirement is deposit. */
  deposit_amount_pence: number | null;
  /**
   * True when the customer flow should collect card details (deposit or full).
   * False for free or pay-at-venue (payment_requirement none with optional list price).
   */
  requires_stripe_checkout: boolean;
  /** @deprecated Use payment_requirement + requires_stripe_checkout */
  requires_online_payment: boolean;
  colour: string;
}

const CAPACITY_CONSUMING_STATUSES = ['Confirmed', 'Pending', 'Seated'];

/** Resolves DB row to enum; supports legacy requires_online_payment. */
export function resolveClassPaymentRequirement(ct: ClassType): ClassPaymentRequirement {
  if (ct.payment_requirement) return ct.payment_requirement;
  if (ct.requires_online_payment === false) return 'none';
  if (ct.price_pence != null && ct.price_pence > 0) return 'full_payment';
  return 'none';
}

function resolveGuestFacingInstructorName(
  classType: ClassType,
  nameById: Record<string, string> | undefined,
): string | null {
  const custom = classType.instructor_name?.trim();
  if (custom) return custom;
  const id = classType.instructor_id;
  if (!id || !nameById) return null;
  return nameById[id] ?? null;
}

function stripeCheckoutNeeded(
  req: ClassPaymentRequirement,
  pricePence: number | null,
  depositPence: number | null,
): boolean {
  if (req === 'full_payment') return (pricePence ?? 0) > 0;
  if (req === 'deposit') return (depositPence ?? 0) > 0;
  return false;
}

/**
 * True when the class start (venue-local date + time) is at least `minNoticeHours` after reference "now".
 */
export function isClassInstanceBookableForGuest(
  instance: Pick<ClassInstance, 'instance_date' | 'start_time'>,
  guestBookingWindow: GuestClassBookingWindow,
): boolean {
  const startMs = venueLocalDateTimeToUtcMs(
    instance.instance_date,
    instance.start_time,
    guestBookingWindow.venueTimezone,
  );
  const nowMs = guestBookingWindow.referenceNowMs ?? Date.now();
  const minNoticeMs = Math.max(0, guestBookingWindow.minNoticeHours) * 60 * 60 * 1000;
  const earliestBookableStartMs = nowMs + minNoticeMs;
  return startMs >= earliestBookableStartMs;
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export function computeClassAvailability(input: ClassEngineInput): ClassAvailabilitySlot[] {
  const { classTypes, instances, bookedByInstance, guestBookingWindow, instructorDisplayNamesById } = input;
  const typeMap = new Map(classTypes.map((ct) => [ct.id, ct]));

  const results: ClassAvailabilitySlot[] = [];

  for (const instance of instances) {
    if (instance.is_cancelled) continue;
    if (guestBookingWindow && !isClassInstanceBookableForGuest(instance, guestBookingWindow)) {
      continue;
    }
    const classType = typeMap.get(instance.class_type_id);
    if (!classType || !classType.is_active) continue;

    const capacity = instance.capacity_override ?? classType.capacity;
    const booked = bookedByInstance[instance.id] ?? 0;
    const remaining = Math.max(0, capacity - booked);

    const paymentRequirement = resolveClassPaymentRequirement(classType);
    const depositPerPerson =
      paymentRequirement === 'deposit'
        ? (classType.deposit_amount_pence ?? null)
        : null;
    const requiresStripe = stripeCheckoutNeeded(
      paymentRequirement,
      classType.price_pence,
      depositPerPerson,
    );

    results.push({
      instance_id: instance.id,
      class_type_id: classType.id,
      class_name: classType.name,
      description: classType.description,
      instance_date: instance.instance_date,
      start_time: instance.start_time,
      duration_minutes: classType.duration_minutes,
      capacity,
      remaining,
      instructor_id: classType.instructor_id,
      instructor_name: resolveGuestFacingInstructorName(classType, instructorDisplayNamesById),
      price_pence: classType.price_pence,
      payment_requirement: paymentRequirement,
      deposit_amount_pence: depositPerPerson,
      requires_stripe_checkout: requiresStripe,
      requires_online_payment: requiresStripe,
      colour: classType.colour,
    });
  }

  results.sort((a, b) => a.start_time.localeCompare(b.start_time));
  return results;
}

// ---------------------------------------------------------------------------
// Fetcher
// ---------------------------------------------------------------------------

export async function fetchClassInput(params: {
  supabase: SupabaseClient;
  venueId: string;
  date: string;
  /**
   * When true, loads `timezone` + `booking_rules.min_notice_hours` and applies `guestBookingWindow`
   * so only future sessions outside the minimum notice period are bookable online.
   */
  forPublicBooking?: boolean;
}): Promise<ClassEngineInput> {
  const { supabase, venueId, date, forPublicBooking } = params;

  const [typesRes, venueRes] = await Promise.all([
    supabase.from('class_types').select('*').eq('venue_id', venueId).eq('is_active', true),
    forPublicBooking === true
      ? supabase.from('venues').select('timezone, booking_rules').eq('id', venueId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ]);

  const classTypes = (typesRes.data ?? []) as ClassType[];
  const classTypeIds = classTypes.map((ct) => ct.id);

  const instructorIds = [...new Set(classTypes.map((ct) => ct.instructor_id).filter(Boolean))] as string[];
  let instructorDisplayNamesById: Record<string, string> = {};
  if (instructorIds.length > 0) {
    const [calsRes, pracsRes] = await Promise.all([
      supabase.from('unified_calendars').select('id, name').eq('venue_id', venueId).in('id', instructorIds),
      supabase.from('practitioners').select('id, name').eq('venue_id', venueId).in('id', instructorIds),
    ]);
    if (calsRes.error) {
      console.error('[fetchClassInput] unified_calendars:', calsRes.error);
    }
    if (pracsRes.error) {
      console.error('[fetchClassInput] practitioners:', pracsRes.error);
    }
    for (const row of pracsRes.data ?? []) {
      const p = row as { id: string; name: string };
      instructorDisplayNamesById[p.id] = p.name;
    }
    for (const row of calsRes.data ?? []) {
      const c = row as { id: string; name: string };
      instructorDisplayNamesById[c.id] = c.name;
    }
  }

  const instancesPromise =
    classTypeIds.length === 0
      ? Promise.resolve({ data: [] as ClassInstance[] })
      : supabase
          .from('class_instances')
          .select('*')
          .eq('instance_date', date)
          .eq('is_cancelled', false)
          .in('class_type_id', classTypeIds)
          .order('start_time');

  const [instancesRes, bookingsRes] = await Promise.all([
    instancesPromise,
    supabase
      .from('bookings')
      .select('id, class_instance_id, party_size, status')
      .eq('venue_id', venueId)
      .eq('booking_date', date)
      .not('class_instance_id', 'is', null)
      .in('status', CAPACITY_CONSUMING_STATUSES),
  ]);

  const instances = (instancesRes.data ?? []) as ClassInstance[];

  const bookedByInstance: Record<string, number> = {};
  for (const b of bookingsRes.data ?? []) {
    const instId = b.class_instance_id!;
    bookedByInstance[instId] = (bookedByInstance[instId] ?? 0) + (b.party_size ?? 1);
  }

  let guestBookingWindow: GuestClassBookingWindow | undefined;
  if (forPublicBooking === true) {
    if ('error' in venueRes && venueRes.error) {
      console.error('[fetchClassInput] venue row for public booking:', venueRes.error);
    }
    const v = venueRes.data as { timezone?: string | null; booking_rules?: unknown } | null;
    const tz =
      v && typeof v.timezone === 'string' && v.timezone.trim() !== '' ? v.timezone.trim() : 'Europe/London';
    const rules = v?.booking_rules as { min_notice_hours?: number } | null | undefined;
    const minNoticeHours =
      typeof rules?.min_notice_hours === 'number' && Number.isFinite(rules.min_notice_hours)
        ? rules.min_notice_hours
        : 1;
    guestBookingWindow = { minNoticeHours, venueTimezone: tz };
  }

  return { date, classTypes, instances, bookedByInstance, guestBookingWindow, instructorDisplayNamesById };
}

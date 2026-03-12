/**
 * Service-based availability engine (v2).
 *
 * Pure functions: given pre-fetched data (EngineInput), compute available slots
 * per service with dual-constraint yield management (covers AND booking count).
 */

import type {
  AvailabilityBlock,
  BookingForEngine,
  BookingRestriction,
  EngineInput,
  EngineServiceResult,
  PartySizeDuration,
  ServiceAvailableSlot,
  ServiceCapacityRule,
  VenueService,
} from '@/types/availability';

const CAPACITY_CONSUMING_STATUSES = ['Confirmed', 'Pending'];

const DEFAULT_DURATION_MINUTES = 90;

/** Parse "HH:mm" or "HH:mm:ss" to minutes since midnight. */
export function timeToMinutes(t: string): number {
  const parts = t.trim().split(':');
  return parseInt(parts[0] ?? '0', 10) * 60 + parseInt(parts[1] ?? '0', 10);
}

/** Format minutes since midnight to "HH:mm". */
export function minutesToTime(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  return `${h.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;
}

/** Day-of-week for a date string YYYY-MM-DD (0=Sun). */
export function getDayOfWeek(dateStr: string): number {
  const [y, mo, d] = dateStr.split('-').map(Number);
  return new Date(y!, mo! - 1, d!).getDay();
}

/** Resolve the best matching capacity rule for a service on a given day/time.
 *  Priority: time-range override > day override > default (both null).
 */
export function resolveCapacityRule(
  rules: ServiceCapacityRule[],
  serviceId: string,
  dayOfWeek: number,
  slotTimeMinutes: number,
): ServiceCapacityRule | null {
  const serviceRules = rules.filter((r) => r.service_id === serviceId);
  if (serviceRules.length === 0) return null;

  let best: ServiceCapacityRule | null = null;
  let bestSpecificity = -1;

  for (const rule of serviceRules) {
    let specificity = 0;

    if (rule.day_of_week != null) {
      if (rule.day_of_week !== dayOfWeek) continue;
      specificity += 1;
    }

    if (rule.time_range_start != null && rule.time_range_end != null) {
      const rangeStart = timeToMinutes(rule.time_range_start);
      const rangeEnd = timeToMinutes(rule.time_range_end);
      if (slotTimeMinutes < rangeStart || slotTimeMinutes >= rangeEnd) continue;
      specificity += 2;
    }

    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      best = rule;
    }
  }

  return best;
}

/** Resolve dining duration for a party size within a service. */
export function resolveDuration(
  durations: PartySizeDuration[],
  serviceId: string,
  partySize: number,
  dayOfWeek: number,
): number {
  const serviceDurations = durations.filter((d) => d.service_id === serviceId);
  if (serviceDurations.length === 0) return DEFAULT_DURATION_MINUTES;

  let best: PartySizeDuration | null = null;
  let bestSpecificity = -1;

  for (const d of serviceDurations) {
    if (partySize < d.min_party_size || partySize > d.max_party_size) continue;

    let specificity = 0;
    if (d.day_of_week != null) {
      if (d.day_of_week !== dayOfWeek) continue;
      specificity += 1;
    }

    if (specificity > bestSpecificity) {
      bestSpecificity = specificity;
      best = d;
    }
  }

  return best?.duration_minutes ?? DEFAULT_DURATION_MINUTES;
}

/** Resolve the restriction row for a service. */
export function resolveRestriction(
  restrictions: BookingRestriction[],
  serviceId: string,
): BookingRestriction | null {
  return restrictions.find((r) => r.service_id === serviceId) ?? null;
}

/** Check whether a slot on a date is blocked by any availability_block. */
export function isSlotBlocked(
  blocks: AvailabilityBlock[],
  venueId: string,
  serviceId: string,
  dateStr: string,
  slotMinutes: number,
): { blocked: boolean; overrideMaxCovers: number | null } {
  for (const block of blocks) {
    if (block.venue_id !== venueId) continue;
    if (block.service_id != null && block.service_id !== serviceId) continue;
    if (dateStr < block.date_start || dateStr > block.date_end) continue;

    if (block.time_start != null && block.time_end != null) {
      const bStart = timeToMinutes(block.time_start);
      const bEnd = timeToMinutes(block.time_end);
      if (slotMinutes < bStart || slotMinutes >= bEnd) continue;
    }

    if (block.block_type === 'closed' || block.block_type === 'special_event') {
      return { blocked: true, overrideMaxCovers: null };
    }
    if (block.block_type === 'reduced_capacity') {
      return { blocked: false, overrideMaxCovers: block.override_max_covers };
    }
  }

  return { blocked: false, overrideMaxCovers: null };
}

/** Count covers and booking count for existing bookings that overlap a slot window. */
export function countOverlapping(
  bookings: BookingForEngine[],
  serviceId: string,
  slotStartMinutes: number,
  slotEndMinutes: number,
): { covers: number; bookingCount: number } {
  let covers = 0;
  let bookingCount = 0;

  for (const b of bookings) {
    if (!CAPACITY_CONSUMING_STATUSES.includes(b.status)) continue;

    const bStart = timeToMinutes(b.booking_time);
    let bEnd: number;

    if (b.estimated_end_time) {
      const endParts = b.estimated_end_time.split('T')[1];
      bEnd = endParts ? timeToMinutes(endParts) : bStart + DEFAULT_DURATION_MINUTES;
    } else {
      bEnd = bStart + DEFAULT_DURATION_MINUTES;
    }

    const overlaps = bStart < slotEndMinutes && bEnd > slotStartMinutes;
    const matchesService = !b.service_id || b.service_id === serviceId;

    if (overlaps && matchesService) {
      covers += b.party_size;
      bookingCount += 1;
    }
  }

  return { covers, bookingCount };
}

/** Generate timeslots for a single service on a given date. */
function generateServiceSlots(
  input: EngineInput,
  service: VenueService,
): { slots: ServiceAvailableSlot[]; restriction: BookingRestriction | null; largeParty: boolean; largePartyMsg: string | null } {
  const dayOfWeek = getDayOfWeek(input.date);

  if (!service.days_of_week.includes(dayOfWeek)) {
    return { slots: [], restriction: null, largeParty: false, largePartyMsg: null };
  }

  const restriction = resolveRestriction(input.restrictions, service.id);

  if (restriction) {
    if (input.party_size < restriction.min_party_size_online || input.party_size > restriction.max_party_size_online) {
      return { slots: [], restriction, largeParty: false, largePartyMsg: null };
    }

    if (restriction.large_party_threshold && input.party_size >= restriction.large_party_threshold) {
      return {
        slots: [],
        restriction,
        largeParty: true,
        largePartyMsg: restriction.large_party_message ?? 'Please call us to book for large parties.',
      };
    }

    const nowMs = input.now.getTime();
    const [y, mo, d] = input.date.split('-').map(Number);
    const bookingDateMs = new Date(y!, mo! - 1, d!, 12, 0, 0).getTime();
    const daysDiff = Math.floor((bookingDateMs - nowMs) / (1000 * 60 * 60 * 24));

    if (daysDiff > restriction.max_advance_days) {
      return { slots: [], restriction, largeParty: false, largePartyMsg: null };
    }
  }

  const duration = resolveDuration(input.durations, service.id, input.party_size, dayOfWeek);
  const serviceStart = timeToMinutes(service.start_time);
  const lastBooking = timeToMinutes(service.last_booking_time);

  const slots: ServiceAvailableSlot[] = [];

  const defaultRule = resolveCapacityRule(input.capacity_rules, service.id, dayOfWeek, serviceStart);
  const intervalMinutes = defaultRule?.slot_interval_minutes ?? 15;
  const bufferMinutes = defaultRule?.buffer_minutes ?? 15;
  const totalOccupancy = duration + bufferMinutes;

  const depositRequired = !!(
    input.deposit_config?.enabled &&
    restriction?.deposit_required_from_party_size &&
    input.party_size >= restriction.deposit_required_from_party_size
  );

  for (let slotMin = serviceStart; slotMin <= lastBooking; slotMin += intervalMinutes) {
    const slotEnd = slotMin + totalOccupancy;
    const slotTimeStr = minutesToTime(slotMin);
    const slotEndStr = minutesToTime(Math.min(slotEnd, timeToMinutes(service.end_time)));

    if (restriction) {
      const minAdvanceMs = restriction.min_advance_minutes * 60 * 1000;
      const [sy, smo, sd] = input.date.split('-').map(Number);
      const slotDateTime = new Date(sy!, smo! - 1, sd!, Math.floor(slotMin / 60), slotMin % 60);
      if (slotDateTime.getTime() - input.now.getTime() < minAdvanceMs) {
        continue;
      }
    }

    const { blocked, overrideMaxCovers } = isSlotBlocked(
      input.blocks,
      input.venue_id,
      service.id,
      input.date,
      slotMin,
    );

    if (blocked) continue;

    const rule = resolveCapacityRule(input.capacity_rules, service.id, dayOfWeek, slotMin);
    const maxCovers = overrideMaxCovers ?? rule?.max_covers_per_slot ?? 20;
    const maxBookings = rule?.max_bookings_per_slot ?? 10;

    const { covers: usedCovers, bookingCount } = countOverlapping(
      input.bookings,
      service.id,
      slotMin,
      slotEnd,
    );

    const availableCovers = Math.max(0, maxCovers - usedCovers);
    const availableBookings = Math.max(0, maxBookings - bookingCount);

    if (availableCovers < input.party_size || availableBookings < 1) continue;

    const limited = availableCovers <= input.party_size * 2 || availableBookings <= 2;

    slots.push({
      key: `${service.id}_${slotTimeStr}`,
      label: slotTimeStr,
      start_time: slotTimeStr,
      end_time: slotEndStr,
      service_name: service.name,
      service_id: service.id,
      available_covers: availableCovers,
      available_bookings: availableBookings,
      estimated_duration: duration,
      deposit_required: depositRequired,
      deposit_amount: depositRequired && input.deposit_config
        ? input.deposit_config.amount_per_person_gbp * input.party_size
        : null,
      limited,
    });
  }

  return { slots, restriction, largeParty: false, largePartyMsg: null };
}

/**
 * Main entry point: compute available slots for all active services on a date.
 * Pure function — all data must be pre-fetched and passed via EngineInput.
 */
export function computeAvailability(input: EngineInput): EngineServiceResult[] {
  const results: EngineServiceResult[] = [];

  const sortedServices = [...input.services].sort((a, b) => a.sort_order - b.sort_order);

  for (const service of sortedServices) {
    if (!service.is_active) continue;

    const { slots, restriction, largeParty, largePartyMsg } = generateServiceSlots(input, service);

    results.push({
      service,
      slots,
      restriction,
      large_party_redirect: largeParty,
      large_party_message: largePartyMsg,
    });
  }

  return results;
}

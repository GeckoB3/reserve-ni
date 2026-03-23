/**
 * Data-fetching layer for the service-based availability engine.
 * Queries Supabase and returns EngineInput ready for computeAvailability().
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  AvailabilityBlock,
  BookingForEngine,
  BookingRestriction,
  BookingRestrictionException,
  EngineInput,
  PartySizeDuration,
  ServiceCapacityRule,
  ServiceScheduleException,
  VenueService,
} from '@/types/availability';

export interface FetchEngineInputParams {
  supabase: SupabaseClient;
  venueId: string;
  date: string;
  partySize: number;
  now?: Date;
}

/**
 * Check whether a venue has been migrated to the service-based model.
 * Returns true if at least one venue_service row exists for this venue.
 */
export async function hasServiceConfig(
  supabase: SupabaseClient,
  venueId: string,
): Promise<boolean> {
  const { count } = await supabase
    .from('venue_services')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId);

  return (count ?? 0) > 0;
}

/**
 * Fetch all data the engine needs in parallel (batched for <100ms).
 */
export async function fetchEngineInput({
  supabase,
  venueId,
  date,
  partySize,
  now,
}: FetchEngineInputParams): Promise<EngineInput> {
  const [
    servicesRes,
    bookingsRes,
    blocksRes,
    venueRes,
    restrictionExcRes,
    scheduleExcRes,
  ] = await Promise.all([
    supabase
      .from('venue_services')
      .select('id, venue_id, name, days_of_week, start_time, end_time, last_booking_time, is_active, sort_order')
      .eq('venue_id', venueId)
      .eq('is_active', true),
    supabase
      .from('bookings')
      .select('id, booking_date, booking_time, party_size, status, service_id, estimated_end_time')
      .eq('venue_id', venueId)
      .eq('booking_date', date),
    supabase
      .from('availability_blocks')
      .select(
        'id, venue_id, service_id, block_type, date_start, date_end, time_start, time_end, override_max_covers, reason, yield_overrides',
      )
      .eq('venue_id', venueId)
      .lte('date_start', date)
      .gte('date_end', date),
    supabase
      .from('venues')
      .select('deposit_config')
      .eq('id', venueId)
      .single(),
    supabase
      .from('booking_restriction_exceptions')
      .select(
        'id, venue_id, service_id, date_start, date_end, time_start, time_end, min_advance_minutes, max_advance_days, min_party_size_online, max_party_size_online, large_party_threshold, large_party_message, deposit_required_from_party_size, reason',
      )
      .eq('venue_id', venueId)
      .lte('date_start', date)
      .gte('date_end', date),
    supabase
      .from('service_schedule_exceptions')
      .select(
        'id, venue_id, service_id, date_start, date_end, is_closed, opens_extra_day, start_time, end_time, last_booking_time, reason',
      )
      .eq('venue_id', venueId)
      .lte('date_start', date)
      .gte('date_end', date),
  ]);

  let blocksData: unknown[] = blocksRes.data ?? [];
  if (
    blocksRes.error &&
    (blocksRes.error.code === '42703' || blocksRes.error.message?.includes('yield_overrides'))
  ) {
    const retry = await supabase
      .from('availability_blocks')
      .select(
        'id, venue_id, service_id, block_type, date_start, date_end, time_start, time_end, override_max_covers, reason',
      )
      .eq('venue_id', venueId)
      .lte('date_start', date)
      .gte('date_end', date);
    if (!retry.error) {
      blocksData = (retry.data ?? []) as unknown[];
    } else {
      console.error('fetchEngineInput: availability_blocks fallback failed:', retry.error.message);
    }
  } else if (blocksRes.error) {
    console.error('fetchEngineInput: availability_blocks', blocksRes.error.message);
  }

  const services: VenueService[] = (servicesRes.data ?? []).map((r) => ({
    ...r,
    start_time: String(r.start_time).slice(0, 5),
    end_time: String(r.end_time).slice(0, 5),
    last_booking_time: String(r.last_booking_time).slice(0, 5),
  }));

  const serviceIds = services.map((s) => s.id);

  const [rulesRes, durationsRes, restrictionsRes] = await Promise.all([
    serviceIds.length > 0
      ? supabase
          .from('service_capacity_rules')
          .select('id, service_id, max_covers_per_slot, max_bookings_per_slot, slot_interval_minutes, buffer_minutes, day_of_week, time_range_start, time_range_end')
          .in('service_id', serviceIds)
      : Promise.resolve({ data: [] as ServiceCapacityRule[] }),
    serviceIds.length > 0
      ? supabase
          .from('party_size_durations')
          .select('id, service_id, min_party_size, max_party_size, duration_minutes, day_of_week')
          .in('service_id', serviceIds)
      : Promise.resolve({ data: [] as PartySizeDuration[] }),
    serviceIds.length > 0
      ? supabase
          .from('booking_restrictions')
          .select('id, service_id, min_advance_minutes, max_advance_days, min_party_size_online, max_party_size_online, large_party_threshold, large_party_message, deposit_required_from_party_size')
          .in('service_id', serviceIds)
      : Promise.resolve({ data: [] as BookingRestriction[] }),
  ]);

  const bookings: BookingForEngine[] = (bookingsRes.data ?? []).map((b) => ({
    id: b.id,
    booking_date: b.booking_date,
    booking_time: typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '00:00',
    party_size: b.party_size,
    status: b.status,
    service_id: b.service_id ?? null,
    estimated_end_time: b.estimated_end_time ?? null,
  }));

  const depositConfig = venueRes.data?.deposit_config as { enabled?: boolean; amount_per_person_gbp?: number } | null;

  if (restrictionExcRes.error) {
    console.error('fetchEngineInput: booking_restriction_exceptions', restrictionExcRes.error.message);
  }
  if (scheduleExcRes.error) {
    console.error('fetchEngineInput: service_schedule_exceptions', scheduleExcRes.error.message);
  }

  const restriction_exceptions: BookingRestrictionException[] = !restrictionExcRes.error
    ? (restrictionExcRes.data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      venue_id: row.venue_id as string,
      service_id: (row.service_id as string | null) ?? null,
      date_start: row.date_start as string,
      date_end: row.date_end as string,
      time_start: row.time_start != null ? String(row.time_start).slice(0, 5) : null,
      time_end: row.time_end != null ? String(row.time_end).slice(0, 5) : null,
      min_advance_minutes: (row.min_advance_minutes as number | null) ?? null,
      max_advance_days: (row.max_advance_days as number | null) ?? null,
      min_party_size_online: (row.min_party_size_online as number | null) ?? null,
      max_party_size_online: (row.max_party_size_online as number | null) ?? null,
      large_party_threshold: (row.large_party_threshold as number | null) ?? null,
      large_party_message: (row.large_party_message as string | null) ?? null,
      deposit_required_from_party_size: (row.deposit_required_from_party_size as number | null) ?? null,
      reason: (row.reason as string | null) ?? null,
    }),
  )
    : [];

  const schedule_exceptions: ServiceScheduleException[] = !scheduleExcRes.error
    ? (scheduleExcRes.data ?? []).map(
    (row: Record<string, unknown>) => ({
      id: row.id as string,
      venue_id: row.venue_id as string,
      service_id: row.service_id as string,
      date_start: row.date_start as string,
      date_end: row.date_end as string,
      is_closed: Boolean(row.is_closed),
      opens_extra_day: Boolean(row.opens_extra_day),
      start_time: row.start_time != null ? String(row.start_time).slice(0, 5) : null,
      end_time: row.end_time != null ? String(row.end_time).slice(0, 5) : null,
      last_booking_time: row.last_booking_time != null ? String(row.last_booking_time).slice(0, 5) : null,
      reason: (row.reason as string | null) ?? null,
    }),
  )
    : [];

  return {
    venue_id: venueId,
    date,
    party_size: partySize,
    services,
    capacity_rules: ((rulesRes.data ?? []) as ServiceCapacityRule[]).map((r) => ({
      ...r,
      time_range_start: r.time_range_start ? String(r.time_range_start).slice(0, 5) : null,
      time_range_end: r.time_range_end ? String(r.time_range_end).slice(0, 5) : null,
    })),
    durations: (durationsRes.data ?? []) as PartySizeDuration[],
    restrictions: (restrictionsRes.data ?? []) as BookingRestriction[],
    blocks: blocksData as AvailabilityBlock[],
    restriction_exceptions,
    schedule_exceptions,
    bookings,
    deposit_config: depositConfig?.enabled
      ? { enabled: true, amount_per_person_gbp: depositConfig.amount_per_person_gbp ?? 5 }
      : null,
    now: now ?? new Date(),
  };
}

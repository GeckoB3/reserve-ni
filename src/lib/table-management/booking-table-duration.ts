import type { SupabaseClient } from '@supabase/supabase-js';
import type { EngineInput } from '@/types/availability';
import { fetchEngineInput } from '@/lib/availability/fetch';
import { getDayOfWeek, resolveDuration } from '@/lib/availability/engine';

const FALLBACK_DURATION_MINUTES = 90;
const FALLBACK_BUFFER_MINUTES = 15;

/**
 * Default buffer from the service's catch-all capacity rule (same source as availability grid).
 */
export async function fetchDefaultBufferMinutesForService(
  supabase: SupabaseClient,
  serviceId: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('service_capacity_rules')
    .select('buffer_minutes')
    .eq('service_id', serviceId)
    .is('day_of_week', null)
    .is('time_range_start', null)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('fetchDefaultBufferMinutesForService failed', {
      serviceId,
      message: error.message,
    });
  }

  return data?.buffer_minutes ?? FALLBACK_BUFFER_MINUTES;
}

/**
 * Duration + buffer aligned with the service availability engine (party-size rules + default buffer).
 * Use when `fetchEngineInput` has already been loaded for the same date/party.
 */
export async function resolveDurationAndBufferForTableAssignment(
  supabase: SupabaseClient,
  engineInput: EngineInput,
  bookingDate: string,
  partySize: number,
  serviceId: string | null | undefined,
): Promise<{ durationMinutes: number; bufferMinutes: number }> {
  if (!serviceId) {
    return { durationMinutes: FALLBACK_DURATION_MINUTES, bufferMinutes: FALLBACK_BUFFER_MINUTES };
  }
  const dow = getDayOfWeek(bookingDate);
  const durationMinutes = resolveDuration(engineInput.durations, serviceId, partySize, dow);
  const bufferMinutes = await fetchDefaultBufferMinutesForService(supabase, serviceId);
  return { durationMinutes, bufferMinutes };
}

/**
 * Fetches engine input then resolves duration + buffer (for routes that do not already have engine input).
 */
export async function resolveTableAssignmentDurationBuffer(
  supabase: SupabaseClient,
  venueId: string,
  bookingDate: string,
  partySize: number,
  serviceId: string | null | undefined,
): Promise<{ durationMinutes: number; bufferMinutes: number }> {
  if (!serviceId) {
    return { durationMinutes: FALLBACK_DURATION_MINUTES, bufferMinutes: FALLBACK_BUFFER_MINUTES };
  }
  const engineInput = await fetchEngineInput({
    supabase,
    venueId,
    date: bookingDate,
    partySize,
  });
  return resolveDurationAndBufferForTableAssignment(
    supabase,
    engineInput,
    bookingDate,
    partySize,
    serviceId,
  );
}

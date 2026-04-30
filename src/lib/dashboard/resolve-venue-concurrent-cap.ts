/**
 * Resolve venue max concurrent covers for a calendar date (legacy JSONB or service engine).
 */

import type { AvailabilityConfig, EngineInput } from '@/types/availability';
import {
  computeAvailability,
  computeEffectiveMinSlotCoverCap,
  getDayOfWeek,
  resolveServiceForDate,
} from '@/lib/availability';

/** Per dining service max covers in one slot for a date (null cap = closed or unknown). */
export interface PerServiceConcurrentSlotCap {
  serviceId: string;
  serviceName: string;
  cap: number | null;
}

/**
 * Max slot capacity per active service for the service engine (one row per service, sorted like computeAvailability).
 */
export function perServiceConcurrentSlotCaps(
  engineInput: EngineInput,
  venueId: string,
  dateStr: string,
): PerServiceConcurrentSlotCap[] {
  const serviceResults = computeAvailability(engineInput);
  const dayOfWeek = getDayOfWeek(dateStr);
  const out: PerServiceConcurrentSlotCap[] = [];

  for (const result of serviceResults) {
    const service = result.service;
    const effectiveService = resolveServiceForDate(
      service,
      engineInput.schedule_exceptions,
      venueId,
      dateStr,
      dayOfWeek,
    );
    if (!effectiveService) {
      out.push({ serviceId: service.id, serviceName: service.name, cap: null });
      continue;
    }

    const effectiveMax = computeEffectiveMinSlotCoverCap(
      engineInput,
      service,
      effectiveService,
      dayOfWeek,
    );
    const rules = engineInput.capacity_rules.filter((r) => r.service_id === service.id);
    const dayRule = rules.find((r) => r.day_of_week === dayOfWeek && !r.time_range_start);
    const defaultRule = rules.find((r) => r.day_of_week == null && !r.time_range_start);
    const rule = dayRule ?? defaultRule;
    const maxCovers = effectiveMax ?? rule?.max_covers_per_slot ?? null;
    out.push({ serviceId: service.id, serviceName: service.name, cap: maxCovers });
  }

  return out;
}

export function resolveServiceEngineConcurrentCapFromInput(
  engineInput: EngineInput,
  venueId: string,
  dateStr: string,
): number | null {
  const rows = perServiceConcurrentSlotCaps(engineInput, venueId, dateStr);
  const caps = rows.map((r) => r.cap).filter((c): c is number => c != null && c > 0);
  return caps.length > 0 ? Math.max(...caps) : null;
}

/** Default duration for overlap when `estimated_end_time` is missing (align with day-sheet fallback). */
export function defaultDurationFromVenueConfig(
  availabilityConfig: AvailabilityConfig | null | undefined,
  serviceDurationMin: number | null,
): number {
  if (serviceDurationMin != null) return serviceDurationMin;
  const c = availabilityConfig;
  if (c && 'model' in c && c.model === 'fixed_intervals' && c.sitting_duration_minutes) {
    return c.sitting_duration_minutes;
  }
  return 90;
}

export function defaultDurationForDashboardDay(
  engine: 'legacy' | 'service',
  engineInput: EngineInput | null,
  availabilityConfig: AvailabilityConfig | null,
): number {
  if (engine === 'service' && engineInput && engineInput.durations.length > 0) {
    return engineInput.durations[0]!.duration_minutes;
  }
  return defaultDurationFromVenueConfig(availabilityConfig, null);
}

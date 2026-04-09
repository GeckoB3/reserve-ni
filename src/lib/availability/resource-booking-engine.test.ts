import { describe, expect, it } from 'vitest';
import type { VenueResource } from '@/types/booking-models';
import {
  computeResourceAvailability,
  resourceDurationCandidatesMinutes,
  resourceHasAvailabilityForAnyDurationCandidate,
  type ResourceEngineInput,
} from './resource-booking-engine';

function baseResource(overrides: Partial<VenueResource> = {}): VenueResource {
  return {
    id: 'res-1',
    venue_id: 'venue-1',
    name: 'Court 1',
    resource_type: 'court',
    min_booking_minutes: 60,
    max_booking_minutes: 120,
    slot_interval_minutes: 30,
    price_per_slot_pence: 1000,
    payment_requirement: 'none',
    deposit_amount_pence: null,
    availability_hours: { '1': [{ start: '09:00', end: '12:00' }] },
    is_active: true,
    sort_order: 0,
    created_at: '',
    display_on_calendar_id: null,
    ...overrides,
  };
}

describe('resourceHasAvailabilityForAnyDurationCandidate', () => {
  it('matches computeResourceAvailability for any duration in the candidate list', () => {
    const resource = baseResource();
    const date = '2026-06-09';
    const durations = resourceDurationCandidatesMinutes(resource);
    const input: ResourceEngineInput = {
      date,
      resources: [resource],
      existingBookings: [],
    };

    const anyDur = resourceHasAvailabilityForAnyDurationCandidate(input, resource.id, durations);
    const anyViaLoop = durations.some((dur) => {
      const results = computeResourceAvailability(input, dur);
      const row = results.find((r) => r.id === resource.id);
      return Boolean(row && row.slots.length > 0);
    });
    expect(anyDur).toBe(anyViaLoop);
  });

  it('returns false when all durations are blocked by an existing booking', () => {
    const resource = baseResource();
    const date = '2026-06-09';
    const durations = resourceDurationCandidatesMinutes(resource);
    const input: ResourceEngineInput = {
      date,
      resources: [resource],
      existingBookings: [
        {
          id: 'b1',
          resource_id: resource.id,
          booking_time: '09:00',
          booking_end_time: '12:00',
          status: 'Confirmed',
        },
      ],
    };

    expect(resourceHasAvailabilityForAnyDurationCandidate(input, resource.id, durations)).toBe(false);
    for (const dur of durations) {
      const results = computeResourceAvailability(input, dur);
      const row = results.find((r) => r.id === resource.id);
      expect(row?.slots.length ?? 0).toBe(0);
    }
  });
});

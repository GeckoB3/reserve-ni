import { describe, it, expect } from 'vitest';
import { resolveSlotBlockState, resolveServiceForDate } from './engine';
import type { AvailabilityBlock, ServiceScheduleException, VenueService } from '@/types/availability';

const venueId = 'v1';
const serviceId = 's1';
const date = '2026-06-15';
const slot = 17 * 60;

function block(partial: Partial<AvailabilityBlock> & Pick<AvailabilityBlock, 'id' | 'block_type'>): AvailabilityBlock {
  return {
    venue_id: venueId,
    service_id: null,
    date_start: '2026-06-01',
    date_end: '2026-06-30',
    time_start: null,
    time_end: null,
    override_max_covers: null,
    reason: null,
    yield_overrides: null,
    ...partial,
  };
}

describe('resolveSlotBlockState', () => {
  it('returns blocked when a matching closed block exists', () => {
    const blocks = [
      block({ id: '1', block_type: 'reduced_capacity', override_max_covers: 10 }),
      block({ id: '2', block_type: 'closed' }),
    ];
    const r = resolveSlotBlockState(blocks, venueId, serviceId, date, slot);
    expect(r.blocked).toBe(true);
  });

  it('returns blocked when special_event matches', () => {
    const blocks = [block({ id: '1', block_type: 'special_event' })];
    const r = resolveSlotBlockState(blocks, venueId, serviceId, date, slot);
    expect(r.blocked).toBe(true);
  });

  it('uses minimum override_max_covers across reduced_capacity blocks', () => {
    const blocks = [
      block({ id: '1', block_type: 'reduced_capacity', override_max_covers: 25 }),
      block({ id: '2', block_type: 'reduced_capacity', override_max_covers: 12 }),
    ];
    const r = resolveSlotBlockState(blocks, venueId, serviceId, date, slot);
    expect(r.blocked).toBe(false);
    expect(r.mergedYield.overrideMaxCovers).toBe(12);
  });

  it('merges yield_overrides with min bookings and max interval', () => {
    const blocks = [
      block({
        id: '1',
        block_type: 'reduced_capacity',
        override_max_covers: 20,
        yield_overrides: { max_bookings_per_slot: 8, slot_interval_minutes: 30 },
      }),
      block({
        id: '2',
        block_type: 'reduced_capacity',
        override_max_covers: 20,
        yield_overrides: { max_bookings_per_slot: 5, slot_interval_minutes: 15 },
      }),
    ];
    const r = resolveSlotBlockState(blocks, venueId, serviceId, date, slot);
    expect(r.mergedYield.maxBookings).toBe(5);
    expect(r.mergedYield.slotInterval).toBe(30);
  });

  it('ignores blocks for other services when service_id is set', () => {
    const blocks = [block({ id: '1', block_type: 'closed', service_id: 'other' })];
    const r = resolveSlotBlockState(blocks, venueId, serviceId, date, slot);
    expect(r.blocked).toBe(false);
  });
});

describe('resolveServiceForDate', () => {
  const service: VenueService = {
    id: serviceId,
    venue_id: venueId,
    name: 'Dinner',
    days_of_week: [5, 6],
    start_time: '17:00',
    end_time: '22:00',
    last_booking_time: '21:00',
    is_active: true,
    sort_order: 0,
  };

  it('returns null when schedule exception marks closed', () => {
    const exc: ServiceScheduleException[] = [
      {
        id: 'e1',
        venue_id: venueId,
        service_id: serviceId,
        date_start: date,
        date_end: date,
        is_closed: true,
        opens_extra_day: false,
        start_time: null,
        end_time: null,
        last_booking_time: null,
        reason: null,
      },
    ];
    expect(resolveServiceForDate(service, exc, venueId, date, 1)).toBeNull();
  });

  it('allows service on non-weekday when opens_extra_day is set', () => {
    const monday = '2026-06-15';
    const dow = 1;
    const exc: ServiceScheduleException[] = [
      {
        id: 'e1',
        venue_id: venueId,
        service_id: serviceId,
        date_start: monday,
        date_end: monday,
        is_closed: false,
        opens_extra_day: true,
        start_time: null,
        end_time: null,
        last_booking_time: null,
        reason: null,
      },
    ];
    const eff = resolveServiceForDate(service, exc, venueId, monday, dow);
    expect(eff).not.toBeNull();
    expect(eff!.start_time).toBe('17:00');
  });
});

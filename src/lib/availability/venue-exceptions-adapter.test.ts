import { describe, it, expect } from 'vitest';
import { blocksToVenueOpeningExceptions } from './venue-exceptions-adapter';
import type { AvailabilityBlock } from '@/types/availability';

function block(partial: Partial<AvailabilityBlock> & Pick<AvailabilityBlock, 'id' | 'block_type'>): AvailabilityBlock {
  return {
    venue_id: 'v1',
    service_id: null,
    date_start: '2026-06-01',
    date_end: '2026-06-30',
    time_start: null,
    time_end: null,
    override_max_covers: null,
    reason: null,
    yield_overrides: null,
    override_periods: null,
    ...partial,
  };
}

describe('blocksToVenueOpeningExceptions', () => {
  it('returns empty array for empty input', () => {
    expect(blocksToVenueOpeningExceptions([])).toEqual([]);
  });

  it('converts closed block to { closed: true } exception', () => {
    const result = blocksToVenueOpeningExceptions([
      block({ id: 'b1', block_type: 'closed', date_start: '2026-07-01', date_end: '2026-07-02', reason: 'Holiday' }),
    ]);
    expect(result).toEqual([
      { id: 'b1', date_start: '2026-07-01', date_end: '2026-07-02', closed: true, reason: 'Holiday' },
    ]);
  });

  it('converts special_event block to { closed: true } exception', () => {
    const result = blocksToVenueOpeningExceptions([
      block({ id: 'b2', block_type: 'special_event', reason: 'Private event' }),
    ]);
    expect(result).toHaveLength(1);
    expect(result[0].closed).toBe(true);
  });

  it('converts amended_hours block to { closed: false, periods } exception', () => {
    const periods = [{ open: '10:00', close: '14:00' }];
    const result = blocksToVenueOpeningExceptions([
      block({ id: 'b3', block_type: 'amended_hours', override_periods: periods, reason: 'Short day' }),
    ]);
    expect(result).toEqual([
      { id: 'b3', date_start: '2026-06-01', date_end: '2026-06-30', closed: false, periods, reason: 'Short day' },
    ]);
  });

  it('filters out blocks with service_id set', () => {
    const result = blocksToVenueOpeningExceptions([
      block({ id: 'b4', block_type: 'closed', service_id: 'svc-1' }),
    ]);
    expect(result).toEqual([]);
  });

  it('filters out reduced_capacity blocks', () => {
    const result = blocksToVenueOpeningExceptions([
      block({ id: 'b5', block_type: 'reduced_capacity', override_max_covers: 10 }),
    ]);
    expect(result).toEqual([]);
  });

  it('skips amended_hours blocks with empty/missing override_periods', () => {
    const result = blocksToVenueOpeningExceptions([
      block({ id: 'b6', block_type: 'amended_hours', override_periods: null }),
      block({ id: 'b7', block_type: 'amended_hours', override_periods: [] }),
    ]);
    expect(result).toEqual([]);
  });

  it('sorts output by date_start', () => {
    const result = blocksToVenueOpeningExceptions([
      block({ id: 'b8', block_type: 'closed', date_start: '2026-08-01', date_end: '2026-08-01' }),
      block({ id: 'b9', block_type: 'closed', date_start: '2026-06-15', date_end: '2026-06-15' }),
    ]);
    expect(result[0].id).toBe('b9');
    expect(result[1].id).toBe('b8');
  });

  it('omits reason when null', () => {
    const result = blocksToVenueOpeningExceptions([
      block({ id: 'b10', block_type: 'closed', reason: null }),
    ]);
    expect(result[0].reason).toBeUndefined();
  });
});

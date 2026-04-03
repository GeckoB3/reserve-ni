import { describe, expect, it } from 'vitest';
import { computeClassAvailability } from './class-session-engine';
import type { ClassInstance, ClassType } from '@/types/booking-models';

const baseType = (overrides: Partial<ClassType> = {}): ClassType => ({
  id: 'ct-1',
  venue_id: 'v-1',
  name: 'Yoga',
  description: null,
  duration_minutes: 60,
  capacity: 10,
  colour: '#22C55E',
  is_active: true,
  price_pence: 500,
  instructor_id: null,
  instructor_name: null,
  requires_online_payment: true,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const baseInstance = (overrides: Partial<ClassInstance> = {}): ClassInstance => ({
  id: 'ci-1',
  class_type_id: 'ct-1',
  timetable_entry_id: null,
  instance_date: '2026-04-10',
  start_time: '10:00:00',
  capacity_override: null,
  is_cancelled: false,
  cancel_reason: null,
  created_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

describe('computeClassAvailability', () => {
  it('sets requires_online_payment true when class type omits the flag (legacy rows)', () => {
    const t = baseType({ requires_online_payment: undefined });
    const slots = computeClassAvailability({
      date: '2026-04-10',
      classTypes: [t],
      instances: [baseInstance()],
      bookedByInstance: {},
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]?.requires_online_payment).toBe(true);
  });

  it('sets requires_online_payment false when class type disables online payment', () => {
    const t = baseType({ requires_online_payment: false });
    const slots = computeClassAvailability({
      date: '2026-04-10',
      classTypes: [t],
      instances: [baseInstance()],
      bookedByInstance: {},
    });
    expect(slots[0]?.requires_online_payment).toBe(false);
  });
});

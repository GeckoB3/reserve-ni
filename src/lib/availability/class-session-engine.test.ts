import { describe, expect, it } from 'vitest';
import {
  computeClassAvailability,
  isClassInstanceBookableForGuest,
  resolveClassPaymentRequirement,
} from './class-session-engine';
import type { ClassInstance, ClassType } from '@/types/booking-models';

const SAMPLE_INSTRUCTOR_ID = '11111111-1111-4111-8111-111111111111';

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
  instructor_id: SAMPLE_INSTRUCTOR_ID,
  instructor_name: null,
  payment_requirement: 'full_payment',
  deposit_amount_pence: null,
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

describe('resolveClassPaymentRequirement', () => {
  it('prefers explicit payment_requirement', () => {
    expect(resolveClassPaymentRequirement(baseType({ payment_requirement: 'none' }))).toBe('none');
  });

  it('maps legacy requires_online_payment false to none', () => {
    expect(
      resolveClassPaymentRequirement(
        baseType({ payment_requirement: undefined, requires_online_payment: false, price_pence: 500 }),
      ),
    ).toBe('none');
  });

  it('maps legacy missing flag with price to full_payment', () => {
    expect(
      resolveClassPaymentRequirement(
        baseType({ payment_requirement: undefined, requires_online_payment: undefined, price_pence: 500 }),
      ),
    ).toBe('full_payment');
  });
});

describe('computeClassAvailability', () => {
  it('sets requires_stripe_checkout for full_payment with price', () => {
    const t = baseType({ payment_requirement: 'full_payment', price_pence: 500 });
    const slots = computeClassAvailability({
      date: '2026-04-10',
      classTypes: [t],
      instances: [baseInstance()],
      bookedByInstance: {},
    });
    expect(slots).toHaveLength(1);
    expect(slots[0]?.requires_stripe_checkout).toBe(true);
    expect(slots[0]?.payment_requirement).toBe('full_payment');
  });

  it('skips Stripe for none with list price', () => {
    const t = baseType({ payment_requirement: 'none', price_pence: 500 });
    const slots = computeClassAvailability({
      date: '2026-04-10',
      classTypes: [t],
      instances: [baseInstance()],
      bookedByInstance: {},
    });
    expect(slots[0]?.requires_stripe_checkout).toBe(false);
  });

  it('excludes instances inside guest min-notice window', () => {
    const t = baseType();
    const inst = baseInstance({ instance_date: '2026-06-15', start_time: '14:00:00' });
    const ref = Date.parse('2026-06-15T13:30:00.000Z');
    const window = {
      minNoticeHours: 1,
      venueTimezone: 'Etc/UTC',
      referenceNowMs: ref,
    };
    expect(isClassInstanceBookableForGuest(inst, window)).toBe(false);
    const slots = computeClassAvailability({
      date: '2026-06-15',
      classTypes: [t],
      instances: [inst],
      bookedByInstance: {},
      guestBookingWindow: window,
    });
    expect(slots).toHaveLength(0);
  });

  it('includes instances after guest min-notice window', () => {
    const t = baseType();
    const inst = baseInstance({ instance_date: '2026-06-15', start_time: '18:00:00' });
    const ref = Date.parse('2026-06-15T09:00:00.000Z');
    const window = {
      minNoticeHours: 2,
      venueTimezone: 'Etc/UTC',
      referenceNowMs: ref,
    };
    expect(isClassInstanceBookableForGuest(inst, window)).toBe(true);
    const slots = computeClassAvailability({
      date: '2026-06-15',
      classTypes: [t],
      instances: [inst],
      bookedByInstance: {},
      guestBookingWindow: window,
    });
    expect(slots).toHaveLength(1);
  });

  it('uses custom instructor_name for guest display when set', () => {
    const t = baseType({ instructor_name: 'Guest teacher' });
    const slots = computeClassAvailability({
      date: '2026-04-10',
      classTypes: [t],
      instances: [baseInstance()],
      bookedByInstance: {},
    });
    expect(slots[0]?.instructor_name).toBe('Guest teacher');
  });

  it('falls back to instructorDisplayNamesById when instructor_name is empty', () => {
    const t = baseType({ instructor_name: null });
    const slots = computeClassAvailability({
      date: '2026-04-10',
      classTypes: [t],
      instances: [baseInstance()],
      bookedByInstance: {},
      instructorDisplayNamesById: { [SAMPLE_INSTRUCTOR_ID]: 'Studio calendar' },
    });
    expect(slots[0]?.instructor_name).toBe('Studio calendar');
  });
});

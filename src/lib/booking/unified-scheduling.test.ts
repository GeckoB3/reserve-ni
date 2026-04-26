import { describe, expect, it } from 'vitest';
import {
  isAppointmentDashboardExperience,
  isAppointmentsProductVenue,
  isUnifiedSchedulingVenue,
} from '@/lib/booking/unified-scheduling';

describe('isAppointmentsProductVenue', () => {
  it('returns true for Appointments Light/Plus/Pro tiers', () => {
    expect(isAppointmentsProductVenue('light')).toBe(true);
    expect(isAppointmentsProductVenue('plus')).toBe(true);
    expect(isAppointmentsProductVenue('appointments')).toBe(true);
  });

  it('returns false for restaurant table SKU', () => {
    expect(isAppointmentsProductVenue('restaurant')).toBe(false);
    expect(isAppointmentsProductVenue('founding')).toBe(false);
  });
});

describe('isAppointmentDashboardExperience', () => {
  it('treats Resources-only Appointments Light as appointment dashboard (not USE primary)', () => {
    expect(
      isAppointmentDashboardExperience('light', 'resource_booking', ['resource_booking'] as const),
    ).toBe(true);
  });

  it('treats restaurant + unified_scheduling secondary as appointment dashboard', () => {
    expect(
      isAppointmentDashboardExperience('restaurant', 'table_reservation', ['unified_scheduling']),
    ).toBe(true);
  });

  it('is false for table-only restaurant without USE tab', () => {
    expect(isAppointmentDashboardExperience('restaurant', 'table_reservation', [])).toBe(false);
  });

  it('is true when primary is USE', () => {
    expect(isUnifiedSchedulingVenue('unified_scheduling')).toBe(true);
    expect(isAppointmentDashboardExperience('restaurant', 'unified_scheduling', [])).toBe(true);
  });
});

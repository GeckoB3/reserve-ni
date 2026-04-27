import { describe, expect, it } from 'vitest';
import type { BookingModel } from '@/types/booking-models';
import {
  isPractitionerScheduleCalendar,
  isVenueScheduleCalendarEligible,
  shouldShowAppointmentAvailabilitySettings,
} from './schedule-calendar-eligibility';

describe('isVenueScheduleCalendarEligible', () => {
  it('is false for table-only venues', () => {
    expect(isVenueScheduleCalendarEligible('table_reservation', [])).toBe(false);
  });

  it('is true when table primary has a schedule-backed secondary', () => {
    expect(isVenueScheduleCalendarEligible('table_reservation', ['event_ticket'])).toBe(true);
    expect(isVenueScheduleCalendarEligible('table_reservation', ['resource_booking'])).toBe(true);
    expect(isVenueScheduleCalendarEligible('table_reservation', ['class_session'])).toBe(true);
    expect(isVenueScheduleCalendarEligible('table_reservation', ['unified_scheduling'])).toBe(true);
  });

  it('is true for resource-only, event-only, class-only, and unified primaries', () => {
    expect(isVenueScheduleCalendarEligible('resource_booking', [])).toBe(true);
    expect(isVenueScheduleCalendarEligible('event_ticket', [])).toBe(true);
    expect(isVenueScheduleCalendarEligible('class_session', [])).toBe(true);
    expect(isVenueScheduleCalendarEligible('unified_scheduling', [])).toBe(true);
    expect(isVenueScheduleCalendarEligible('practitioner_appointment', [])).toBe(true);
  });

  it('is true for event + resource combination (secondaries)', () => {
    expect(isVenueScheduleCalendarEligible('event_ticket', ['resource_booking'])).toBe(true);
  });
});

describe('isPractitionerScheduleCalendar', () => {
  it('matches schedule calendar eligibility for routing', () => {
    const cases: Array<{ primary: BookingModel; enabled: BookingModel[] }> = [
      { primary: 'table_reservation', enabled: [] },
      { primary: 'table_reservation', enabled: ['event_ticket'] },
      { primary: 'resource_booking', enabled: [] },
      { primary: 'event_ticket', enabled: ['resource_booking'] },
      { primary: 'class_session', enabled: ['event_ticket'] },
      { primary: 'unified_scheduling', enabled: ['resource_booking'] },
    ];
    for (const { primary, enabled } of cases) {
      expect(isPractitionerScheduleCalendar(primary, enabled)).toBe(
        isVenueScheduleCalendarEligible(primary, enabled),
      );
    }
  });
});

describe('shouldShowAppointmentAvailabilitySettings', () => {
  it('delegates to schedule calendar eligibility', () => {
    expect(shouldShowAppointmentAvailabilitySettings('table_reservation', [])).toBe(false);
    expect(shouldShowAppointmentAvailabilitySettings('resource_booking', [])).toBe(true);
  });
});

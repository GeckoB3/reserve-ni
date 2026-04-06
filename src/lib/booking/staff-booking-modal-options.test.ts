import { describe, expect, it } from 'vitest';
import {
  defaultStaffBookingSurfaceTab,
  getStaffBookingSurfaceTabs,
  parseStaffBookingSurfaceTabIdFromQuery,
} from '@/lib/booking/staff-booking-modal-options';

describe('getStaffBookingSurfaceTabs', () => {
  it('table primary with unified_scheduling secondary exposes Table and Appointment', () => {
    const tabs = getStaffBookingSurfaceTabs('table_reservation', ['unified_scheduling']);
    expect(tabs.map((t) => t.id)).toEqual(['table_reservation', 'unified_scheduling']);
  });

  it('unified primary with event secondary exposes Appointment then Event', () => {
    const tabs = getStaffBookingSurfaceTabs('unified_scheduling', ['event_ticket']);
    expect(tabs.map((t) => t.id)).toEqual(['unified_scheduling', 'event_ticket']);
  });

  it('event primary with class secondary exposes Class then Event (product order)', () => {
    const tabs = getStaffBookingSurfaceTabs('event_ticket', ['class_session']);
    expect(tabs.map((t) => t.id)).toEqual(['class_session', 'event_ticket']);
  });

  it('table primary with class and resource exposes Table, Class, Resource (no Appointment without unified)', () => {
    const tabs = getStaffBookingSurfaceTabs('table_reservation', ['class_session', 'resource_booking']);
    expect(tabs.map((t) => t.id)).toEqual(['table_reservation', 'class_session', 'resource_booking']);
  });
});

describe('defaultStaffBookingSurfaceTab', () => {
  it('defaults to Table for table primary', () => {
    expect(defaultStaffBookingSurfaceTab('table_reservation', ['unified_scheduling'])).toBe('table_reservation');
  });

  it('defaults to Appointment for unified primary', () => {
    expect(defaultStaffBookingSurfaceTab('unified_scheduling', ['event_ticket'])).toBe('unified_scheduling');
  });

  it('defaults to Appointment for practitioner_appointment primary', () => {
    expect(defaultStaffBookingSurfaceTab('practitioner_appointment', [])).toBe('unified_scheduling');
  });

  it('defaults to Event for event primary', () => {
    expect(defaultStaffBookingSurfaceTab('event_ticket', ['class_session'])).toBe('event_ticket');
  });
});

describe('parseStaffBookingSurfaceTabIdFromQuery', () => {
  const tabs = getStaffBookingSurfaceTabs('table_reservation', ['unified_scheduling', 'class_session']);

  it('accepts short aliases', () => {
    expect(parseStaffBookingSurfaceTabIdFromQuery('table', tabs)).toBe('table_reservation');
    expect(parseStaffBookingSurfaceTabIdFromQuery('appointment', tabs)).toBe('unified_scheduling');
    expect(parseStaffBookingSurfaceTabIdFromQuery('class', tabs)).toBe('class_session');
  });

  it('returns null when tab not exposed', () => {
    expect(parseStaffBookingSurfaceTabIdFromQuery('event', tabs)).toBeNull();
  });
});

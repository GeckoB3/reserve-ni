import { describe, expect, it } from 'vitest';
import {
  attendanceConfirmationSources,
  showAttendanceConfirmedPill,
  showDepositPendingPill,
} from './booking-staff-indicators';

describe('showDepositPendingPill', () => {
  it('true when deposit pending and amount > 0', () => {
    expect(showDepositPendingPill({ deposit_status: 'Pending', deposit_amount_pence: 500 })).toBe(true);
  });

  it('false when deposit paid', () => {
    expect(showDepositPendingPill({ deposit_status: 'Paid', deposit_amount_pence: 500 })).toBe(false);
  });

  it('false when pending but zero amount (odd row)', () => {
    expect(showDepositPendingPill({ deposit_status: 'Pending', deposit_amount_pence: 0 })).toBe(false);
  });

  it('false when not required', () => {
    expect(showDepositPendingPill({ deposit_status: 'Not Required', deposit_amount_pence: null })).toBe(false);
  });
});

describe('showAttendanceConfirmedPill', () => {
  it('false when neither guest nor staff', () => {
    expect(showAttendanceConfirmedPill({})).toBe(false);
  });

  it('true when guest confirmed only', () => {
    expect(
      showAttendanceConfirmedPill({ guest_attendance_confirmed_at: '2026-01-01T12:00:00.000Z' }),
    ).toBe(true);
  });

  it('true when staff confirmed only', () => {
    expect(
      showAttendanceConfirmedPill({ staff_attendance_confirmed_at: '2026-01-02T12:00:00.000Z' }),
    ).toBe(true);
  });

  it('true when both (edge case 3)', () => {
    expect(
      showAttendanceConfirmedPill({
        guest_attendance_confirmed_at: '2026-01-01T12:00:00.000Z',
        staff_attendance_confirmed_at: '2026-01-02T12:00:00.000Z',
      }),
    ).toBe(true);
  });
});

describe('attendanceConfirmationSources', () => {
  it('returns both timestamps when set', () => {
    const r = attendanceConfirmationSources({
      guest_attendance_confirmed_at: '2026-01-01T12:00:00.000Z',
      staff_attendance_confirmed_at: '2026-01-02T12:00:00.000Z',
    });
    expect(r.guestAt).toBe('2026-01-01T12:00:00.000Z');
    expect(r.staffAt).toBe('2026-01-02T12:00:00.000Z');
  });
});

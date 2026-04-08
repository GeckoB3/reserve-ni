/**
 * Staff-facing booking indicators (pills) — pure derivations from booking row fields.
 */

export interface BookingStaffIndicatorInput {
  deposit_status?: string | null;
  deposit_amount_pence?: number | null;
  guest_attendance_confirmed_at?: string | null;
  staff_attendance_confirmed_at?: string | null;
}

export function showDepositPendingPill(row: BookingStaffIndicatorInput): boolean {
  if (row.deposit_status !== 'Pending') return false;
  const pence = row.deposit_amount_pence ?? 0;
  return pence > 0;
}

export function showAttendanceConfirmedPill(row: BookingStaffIndicatorInput): boolean {
  return Boolean(row.guest_attendance_confirmed_at?.trim()) || Boolean(row.staff_attendance_confirmed_at?.trim());
}

export interface AttendanceConfirmationSources {
  guestAt: string | null;
  staffAt: string | null;
}

export function attendanceConfirmationSources(row: BookingStaffIndicatorInput): AttendanceConfirmationSources {
  const g = row.guest_attendance_confirmed_at?.trim();
  const s = row.staff_attendance_confirmed_at?.trim();
  return {
    guestAt: g ? g : null,
    staffAt: s ? s : null,
  };
}

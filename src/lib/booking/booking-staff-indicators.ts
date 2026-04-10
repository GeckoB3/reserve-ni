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

/** Staff "Confirm Booking" (attendance) — same rules as dashboard booking lists. */
export function canShowConfirmBookingAttendanceAction(
  row: BookingStaffIndicatorInput & { source?: string | null; status: string },
): boolean {
  if (row.source === 'walk-in') return false;
  if (showAttendanceConfirmedPill(row)) return false;
  return !['Cancelled', 'No-Show', 'Completed'].includes(row.status);
}

export function canShowCancelStaffAttendanceConfirmationAction(
  row: BookingStaffIndicatorInput & { source?: string | null; status: string },
): boolean {
  if (row.source === 'walk-in') return false;
  if (!row.staff_attendance_confirmed_at?.trim()) return false;
  return !['Cancelled', 'No-Show', 'Completed'].includes(row.status);
}

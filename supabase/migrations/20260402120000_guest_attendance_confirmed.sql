-- Guest tapped "I'll be there" / "Confirm I'm coming" on the pre-visit reminder page
-- (booking may already be Confirmed — we store attendance separately from booking status).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS guest_attendance_confirmed_at timestamptz;

COMMENT ON COLUMN bookings.guest_attendance_confirmed_at IS
  'Set when the guest confirms attendance via the reminder link (independent of booking status).';

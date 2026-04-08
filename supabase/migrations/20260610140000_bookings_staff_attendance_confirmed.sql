-- Staff can mark attendance confirmed (e.g. phone) independently of guest link confirmation.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS staff_attendance_confirmed_at timestamptz;

COMMENT ON COLUMN bookings.staff_attendance_confirmed_at IS
  'Set when venue staff marks attendance confirmed; cleared when toggled off. Independent of guest_attendance_confirmed_at (SMS/email confirm link).';

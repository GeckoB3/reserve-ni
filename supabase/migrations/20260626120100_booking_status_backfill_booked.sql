-- Backfill: existing rows with status 'Confirmed' that have no attendance
-- timestamp set were "Confirmed" under the old (overloaded) meaning of the
-- enum. Under the new meaning, those bookings are simply `Booked`.
--
-- Rows that DO have an attendance timestamp are already aligned with the new
-- semantics of `Confirmed`, so we leave them alone.

UPDATE bookings
SET status = 'Booked'
WHERE status = 'Confirmed'
  AND staff_attendance_confirmed_at IS NULL
  AND guest_attendance_confirmed_at IS NULL;

-- Reporting tables that capture historical status transitions: any
-- `old_status = 'Confirmed'` event that predates this split refers to the
-- old meaning. We do not rewrite history — the audit trail keeps the literal
-- status that was stored at the time. Reports that aggregate "active"
-- bookings should use the new BOOKING_HELD_STATUSES set (`Booked` + `Confirmed`).

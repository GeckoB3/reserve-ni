-- Allow booking deletes (e.g. import undo) when a table status row still references the booking.
-- Previously the FK had no ON DELETE action (NO ACTION), which blocked DELETE on bookings.

ALTER TABLE table_statuses DROP CONSTRAINT IF EXISTS table_statuses_booking_id_fkey;

ALTER TABLE table_statuses
  ADD CONSTRAINT table_statuses_booking_id_fkey
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL;

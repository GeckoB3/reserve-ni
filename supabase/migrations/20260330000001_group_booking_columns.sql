-- Add group booking support columns to bookings table
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS group_booking_id uuid,
  ADD COLUMN IF NOT EXISTS person_label text;

-- Partial index for fast group lookups (only rows that belong to a group)
CREATE INDEX IF NOT EXISTS idx_bookings_group_booking_id
  ON bookings (group_booking_id)
  WHERE group_booking_id IS NOT NULL;

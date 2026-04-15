-- Add table_type column to venue_tables.
-- Separate from 'zone' (spatial area); describes the seating style.
-- Allowed values: Regular, High-Top, Counter, Bar, Outdoor

ALTER TABLE venue_tables
  ADD COLUMN IF NOT EXISTS table_type text NOT NULL DEFAULT 'Regular'
  CHECK (table_type IN ('Regular', 'High-Top', 'Counter', 'Bar', 'Outdoor'));

COMMENT ON COLUMN venue_tables.table_type IS
  'Seating style of the table. One of: Regular, High-Top, Counter, Bar, Outdoor.';

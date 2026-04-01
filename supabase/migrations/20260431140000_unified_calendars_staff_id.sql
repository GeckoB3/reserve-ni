-- Link staff accounts to a bookable calendar for USE venues (replaces practitioners.staff_id).

ALTER TABLE unified_calendars
  ADD COLUMN IF NOT EXISTS staff_id uuid REFERENCES staff (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_unified_calendars_staff
  ON unified_calendars (venue_id, staff_id)
  WHERE staff_id IS NOT NULL;

COMMENT ON COLUMN unified_calendars.staff_id IS 'Optional: staff user who manages this calendar (breaks / own schedule).';

-- Unify closures, amended hours, and reduced capacity into availability_blocks
-- for all booking models. Appointment/unified venues previously used the
-- venue_opening_exceptions JSONB column; this migration adds an amended_hours
-- block type and migrates that data into availability_blocks rows.

-- 1. Extend block_type enum
ALTER TYPE block_type ADD VALUE IF NOT EXISTS 'amended_hours';

-- 2. Add override_periods column (stores amended-hours open/close periods)
ALTER TABLE availability_blocks
  ADD COLUMN IF NOT EXISTS override_periods jsonb;

COMMENT ON COLUMN availability_blocks.override_periods IS
  'Array of { open: "HH:mm", close: "HH:mm" } periods; required when block_type = amended_hours.';

-- 3. Migrate venue_opening_exceptions JSONB → availability_blocks rows
DO $$
DECLARE
  v_row RECORD;
  exc   jsonb;
BEGIN
  FOR v_row IN
    SELECT id, venue_opening_exceptions
    FROM venues
    WHERE jsonb_array_length(venue_opening_exceptions) > 0
  LOOP
    FOR exc IN SELECT * FROM jsonb_array_elements(v_row.venue_opening_exceptions)
    LOOP
      IF (exc ->> 'closed')::boolean = true THEN
        INSERT INTO availability_blocks (venue_id, service_id, block_type, date_start, date_end, reason)
        VALUES (
          v_row.id,
          NULL,
          'closed',
          (exc ->> 'date_start')::date,
          (exc ->> 'date_end')::date,
          exc ->> 'reason'
        );
      ELSE
        INSERT INTO availability_blocks (venue_id, service_id, block_type, date_start, date_end, override_periods, reason)
        VALUES (
          v_row.id,
          NULL,
          'amended_hours',
          (exc ->> 'date_start')::date,
          (exc ->> 'date_end')::date,
          exc -> 'periods',
          exc ->> 'reason'
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- 4. Clear migrated data
UPDATE venues
SET venue_opening_exceptions = '[]'::jsonb
WHERE jsonb_array_length(venue_opening_exceptions) > 0;

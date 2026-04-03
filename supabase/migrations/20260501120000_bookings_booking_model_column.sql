-- Per-row booking model for analytics, API selects, and reporting.
--
-- Do not re-run 20260327000001_multi_model_foundation.sql in the SQL editor if `booking_model` enum already exists
-- (ERROR 42710). Use `supabase migration up` / `supabase db push` so only new files apply.
--
-- Note: `venues.booking_model` was added in that migration; `bookings.booking_model` was not. This migration adds it.

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS booking_model booking_model NOT NULL DEFAULT 'table_reservation';

COMMENT ON COLUMN bookings.booking_model IS
  'Which product line this row belongs to; mirrors FKs for queries and reporting.';

-- Backfill using FKs that exist after multi_model_foundation (always safe).
UPDATE bookings
SET booking_model = (
  CASE
    WHEN experience_event_id IS NOT NULL THEN 'event_ticket'::booking_model
    WHEN class_instance_id IS NOT NULL THEN 'class_session'::booking_model
    WHEN resource_id IS NOT NULL THEN 'resource_booking'::booking_model
    WHEN practitioner_id IS NOT NULL AND appointment_service_id IS NOT NULL THEN 'practitioner_appointment'::booking_model
    ELSE 'table_reservation'::booking_model
  END
);

-- Unified scheduling: columns + enum value come from 20260430120000_unified_scheduling_engine.sql.
DO $$
DECLARE
  has_unified_enum boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'public'
      AND t.typname = 'booking_model'
      AND e.enumlabel = 'unified_scheduling'
  )
  INTO has_unified_enum;

  IF has_unified_enum THEN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'event_session_id'
  ) THEN
    UPDATE bookings
    SET booking_model = 'unified_scheduling'::booking_model
    WHERE event_session_id IS NOT NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'calendar_id'
  ) AND EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'bookings'
      AND column_name = 'service_item_id'
  ) THEN
    UPDATE bookings
    SET booking_model = 'unified_scheduling'::booking_model
    WHERE calendar_id IS NOT NULL
      AND service_item_id IS NOT NULL;
  END IF;
  END IF;
END $$;

-- Per-entity booking window and cancellation notice (moved from venue-level appointment rules).
-- Restaurant table cancellation notice: booking_restrictions.cancellation_notice_hours.

ALTER TABLE service_items
  ADD COLUMN IF NOT EXISTS max_advance_booking_days int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_booking_notice_hours int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours int NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS allow_same_day_booking boolean NOT NULL DEFAULT true;

ALTER TABLE appointment_services
  ADD COLUMN IF NOT EXISTS max_advance_booking_days int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_booking_notice_hours int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours int NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS allow_same_day_booking boolean NOT NULL DEFAULT true;

ALTER TABLE experience_events
  ADD COLUMN IF NOT EXISTS max_advance_booking_days int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_booking_notice_hours int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours int NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS allow_same_day_booking boolean NOT NULL DEFAULT true;

ALTER TABLE class_types
  ADD COLUMN IF NOT EXISTS max_advance_booking_days int NOT NULL DEFAULT 90,
  ADD COLUMN IF NOT EXISTS min_booking_notice_hours int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours int NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS allow_same_day_booking boolean NOT NULL DEFAULT true;

-- unified_calendars already has min_booking_notice_hours + max_advance_booking_days (USE migration).
ALTER TABLE unified_calendars
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours int NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS allow_same_day_booking boolean NOT NULL DEFAULT true;

ALTER TABLE booking_restrictions
  ADD COLUMN IF NOT EXISTS cancellation_notice_hours int NOT NULL DEFAULT 48;

COMMENT ON COLUMN service_items.max_advance_booking_days IS 'Guest-facing: max days ahead this service can be booked.';
COMMENT ON COLUMN service_items.cancellation_notice_hours IS 'Hours before start for full deposit refund on this service.';
COMMENT ON COLUMN unified_calendars.cancellation_notice_hours IS 'For calendar_type=resource: hours before start for deposit refund.';
COMMENT ON COLUMN unified_calendars.allow_same_day_booking IS 'For calendar_type=resource: when false, guests cannot book the venue-local current day.';
COMMENT ON COLUMN booking_restrictions.cancellation_notice_hours IS 'Table reservation: hours before start for deposit refund for this dining service.';

-- Backfill from legacy venues.booking_rules JSON (best-effort).
UPDATE service_items si
SET
  max_advance_booking_days = COALESCE(NULLIF((v.booking_rules->>'max_advance_booking_days'), '')::int, si.max_advance_booking_days),
  min_booking_notice_hours = COALESCE(NULLIF((v.booking_rules->>'min_notice_hours'), '')::int, si.min_booking_notice_hours),
  cancellation_notice_hours = COALESCE(NULLIF((v.booking_rules->>'cancellation_notice_hours'), '')::int, si.cancellation_notice_hours),
  allow_same_day_booking = COALESCE((v.booking_rules->>'allow_same_day_booking')::boolean, si.allow_same_day_booking)
FROM venues v
WHERE si.venue_id = v.id
  AND v.booking_rules IS NOT NULL
  AND v.booking_rules::text != 'null';

UPDATE appointment_services s
SET
  max_advance_booking_days = COALESCE(NULLIF((v.booking_rules->>'max_advance_booking_days'), '')::int, s.max_advance_booking_days),
  min_booking_notice_hours = COALESCE(NULLIF((v.booking_rules->>'min_notice_hours'), '')::int, s.min_booking_notice_hours),
  cancellation_notice_hours = COALESCE(NULLIF((v.booking_rules->>'cancellation_notice_hours'), '')::int, s.cancellation_notice_hours),
  allow_same_day_booking = COALESCE((v.booking_rules->>'allow_same_day_booking')::boolean, s.allow_same_day_booking)
FROM venues v
WHERE s.venue_id = v.id
  AND v.booking_rules IS NOT NULL
  AND v.booking_rules::text != 'null';

UPDATE experience_events e
SET
  max_advance_booking_days = COALESCE(NULLIF((v.booking_rules->>'max_advance_booking_days'), '')::int, e.max_advance_booking_days),
  min_booking_notice_hours = COALESCE(NULLIF((v.booking_rules->>'min_notice_hours'), '')::int, e.min_booking_notice_hours),
  cancellation_notice_hours = COALESCE(NULLIF((v.booking_rules->>'cancellation_notice_hours'), '')::int, e.cancellation_notice_hours),
  allow_same_day_booking = COALESCE((v.booking_rules->>'allow_same_day_booking')::boolean, e.allow_same_day_booking)
FROM venues v
WHERE e.venue_id = v.id
  AND v.booking_rules IS NOT NULL
  AND v.booking_rules::text != 'null';

UPDATE class_types ct
SET
  max_advance_booking_days = COALESCE(NULLIF((v.booking_rules->>'max_advance_booking_days'), '')::int, ct.max_advance_booking_days),
  min_booking_notice_hours = COALESCE(NULLIF((v.booking_rules->>'min_notice_hours'), '')::int, ct.min_booking_notice_hours),
  cancellation_notice_hours = COALESCE(NULLIF((v.booking_rules->>'cancellation_notice_hours'), '')::int, ct.cancellation_notice_hours),
  allow_same_day_booking = COALESCE((v.booking_rules->>'allow_same_day_booking')::boolean, ct.allow_same_day_booking)
FROM venues v
WHERE ct.venue_id = v.id
  AND v.booking_rules IS NOT NULL
  AND v.booking_rules::text != 'null';

UPDATE unified_calendars uc
SET
  max_advance_booking_days = COALESCE(NULLIF((v.booking_rules->>'max_advance_booking_days'), '')::int, uc.max_advance_booking_days),
  min_booking_notice_hours = COALESCE(NULLIF((v.booking_rules->>'min_notice_hours'), '')::int, uc.min_booking_notice_hours),
  cancellation_notice_hours = COALESCE(NULLIF((v.booking_rules->>'cancellation_notice_hours'), '')::int, uc.cancellation_notice_hours),
  allow_same_day_booking = COALESCE((v.booking_rules->>'allow_same_day_booking')::boolean, uc.allow_same_day_booking)
FROM venues v
WHERE uc.venue_id = v.id
  AND uc.calendar_type = 'resource'
  AND v.booking_rules IS NOT NULL
  AND v.booking_rules::text != 'null';

UPDATE booking_restrictions br
SET cancellation_notice_hours = COALESCE(
  NULLIF((v.booking_rules->>'cancellation_notice_hours'), '')::int,
  br.cancellation_notice_hours
)
FROM venue_services vs
JOIN venues v ON v.id = vs.venue_id
WHERE br.service_id = vs.id
  AND v.booking_rules IS NOT NULL
  AND v.booking_rules::text != 'null';

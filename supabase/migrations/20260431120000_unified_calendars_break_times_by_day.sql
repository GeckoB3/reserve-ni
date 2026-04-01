-- Per-day breaks for unified calendars (USE plan §2.2 / §3.2), aligned with practitioners.break_times_by_day.

ALTER TABLE unified_calendars
  ADD COLUMN IF NOT EXISTS break_times_by_day jsonb;

COMMENT ON COLUMN unified_calendars.break_times_by_day IS
  'Optional per-weekday break windows (same shape as practitioners.break_times_by_day); null = use break_times for all days.';

UPDATE unified_calendars uc
SET break_times_by_day = p.break_times_by_day
FROM practitioners p
WHERE p.id = uc.id
  AND p.break_times_by_day IS NOT NULL
  AND uc.break_times_by_day IS NULL;

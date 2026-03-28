-- Backfill Saturday (UTC weekday key "6") for practitioners who still have the
-- old Mon–Fri-only default (keys 1–5 present, 6 absent). Avoids adding Saturday
-- for part-time templates that only set a subset of days.

UPDATE practitioners
SET working_hours = working_hours || jsonb_build_object(
  '6',
  '[{"start":"09:00","end":"17:00"}]'::jsonb
)
WHERE NOT (working_hours ? '6')
  AND (working_hours ? '1')
  AND (working_hours ? '2')
  AND (working_hours ? '3')
  AND (working_hours ? '4')
  AND (working_hours ? '5');

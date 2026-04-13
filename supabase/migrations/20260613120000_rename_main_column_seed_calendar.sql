-- The dev script scripts/seed-dev-test1-class-primary-venue.mjs created a default team column
-- named 'Main column' (matching old form placeholder text). Rename to a neutral label.
-- To remove a calendar entirely, venues need at least one other bookable calendar first
-- (see DELETE /api/venue/practitioners).
UPDATE unified_calendars
SET name = 'Team calendar'
WHERE name = 'Main column'
  AND calendar_type = 'practitioner';

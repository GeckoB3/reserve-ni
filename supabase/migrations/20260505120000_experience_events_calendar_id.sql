-- Assign experience events to a unified calendar column (non-resource) for staff calendar display.

ALTER TABLE experience_events
  ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES unified_calendars(id) ON DELETE SET NULL;

COMMENT ON COLUMN experience_events.calendar_id IS
  'Host unified calendar column for this event; used for staff calendar placement and conflict checks.';

CREATE INDEX IF NOT EXISTS idx_experience_events_calendar_date
  ON experience_events (calendar_id, event_date)
  WHERE calendar_id IS NOT NULL AND is_active = true;

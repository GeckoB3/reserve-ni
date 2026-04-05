-- Resources (unified_calendars.calendar_type = 'resource') can be shown on a host calendar column.

ALTER TABLE unified_calendars
  ADD COLUMN IF NOT EXISTS display_on_calendar_id uuid REFERENCES unified_calendars(id) ON DELETE SET NULL;

COMMENT ON COLUMN unified_calendars.display_on_calendar_id IS
  'For calendar_type=resource: unified calendar column (non-resource) this resource appears under.';

ALTER TABLE unified_calendars
  ADD CONSTRAINT unified_calendars_display_on_only_for_resource CHECK (
    display_on_calendar_id IS NULL OR calendar_type = 'resource'
  );

CREATE INDEX IF NOT EXISTS idx_unified_calendars_display_on_calendar_id
  ON unified_calendars (display_on_calendar_id)
  WHERE calendar_type = 'resource';

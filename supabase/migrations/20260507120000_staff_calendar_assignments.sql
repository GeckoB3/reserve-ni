-- Many-to-many: which bookable calendars (unified_calendars) a staff user may manage.
-- Replaces exclusive use of unified_calendars.staff_id for access control.

CREATE TABLE IF NOT EXISTS staff_calendar_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  calendar_id uuid NOT NULL REFERENCES unified_calendars (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT staff_calendar_assignments_unique UNIQUE (staff_id, calendar_id)
);

CREATE INDEX IF NOT EXISTS idx_staff_calendar_assignments_venue_staff
  ON staff_calendar_assignments (venue_id, staff_id);

CREATE INDEX IF NOT EXISTS idx_staff_calendar_assignments_calendar
  ON staff_calendar_assignments (calendar_id);

COMMENT ON TABLE staff_calendar_assignments IS 'Staff users assigned to manage one or more bookable calendars (unified scheduling).';

-- Backfill from legacy unified_calendars.staff_id
INSERT INTO staff_calendar_assignments (venue_id, staff_id, calendar_id)
SELECT uc.venue_id, uc.staff_id, uc.id
FROM unified_calendars uc
WHERE uc.staff_id IS NOT NULL
ON CONFLICT (staff_id, calendar_id) DO NOTHING;

-- Drop exclusive column; junction is source of truth for who manages which calendar
UPDATE unified_calendars SET staff_id = NULL WHERE staff_id IS NOT NULL;

ALTER TABLE staff_calendar_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_staff_calendar_assignments"
  ON staff_calendar_assignments FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "service_role_staff_calendar_assignments"
  ON staff_calendar_assignments FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

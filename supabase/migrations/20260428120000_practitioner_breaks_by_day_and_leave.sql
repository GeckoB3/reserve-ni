-- Model B: optional per-weekday breaks; dated leave periods (annual / sick) blocking availability.

ALTER TABLE practitioners
  ADD COLUMN IF NOT EXISTS break_times_by_day jsonb;

COMMENT ON COLUMN practitioners.break_times_by_day IS
  'When non-null and non-empty object, breaks vary by weekday (keys "0"–"6" JS getDay). When null, use break_times for every working day.';

CREATE TABLE IF NOT EXISTS practitioner_leave_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  practitioner_id uuid NOT NULL REFERENCES practitioners (id) ON DELETE CASCADE,
  start_date date NOT NULL,
  end_date date NOT NULL,
  leave_type text NOT NULL DEFAULT 'annual' CHECK (leave_type IN ('annual', 'sick', 'other')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT practitioner_leave_periods_date_order CHECK (end_date >= start_date)
);

CREATE INDEX IF NOT EXISTS idx_pract_leave_venue_range
  ON practitioner_leave_periods (venue_id, start_date, end_date);

CREATE INDEX IF NOT EXISTS idx_pract_leave_practitioner_range
  ON practitioner_leave_periods (practitioner_id, start_date, end_date);

ALTER TABLE practitioner_leave_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_practitioner_leave_periods" ON practitioner_leave_periods;
CREATE POLICY "staff_manage_practitioner_leave_periods"
  ON practitioner_leave_periods FOR ALL
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

DROP POLICY IF EXISTS "service_role_practitioner_leave_periods" ON practitioner_leave_periods;
CREATE POLICY "service_role_practitioner_leave_periods"
  ON practitioner_leave_periods FOR ALL TO service_role USING (true) WITH CHECK (true);

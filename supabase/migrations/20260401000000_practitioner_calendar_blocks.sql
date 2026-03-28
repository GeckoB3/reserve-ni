-- Model B: practitioner calendar breaks / blocked time (not table_blocks)

CREATE TABLE IF NOT EXISTS practitioner_calendar_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  practitioner_id uuid NOT NULL REFERENCES practitioners (id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time time without time zone NOT NULL,
  end_time time without time zone NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES staff (id),
  CONSTRAINT practitioner_calendar_blocks_time_check CHECK (end_time > start_time)
);

CREATE INDEX IF NOT EXISTS idx_pract_cal_blocks_venue_date
  ON practitioner_calendar_blocks (venue_id, block_date);

CREATE INDEX IF NOT EXISTS idx_pract_cal_blocks_pract_date
  ON practitioner_calendar_blocks (practitioner_id, block_date);

ALTER TABLE practitioner_calendar_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_practitioner_calendar_blocks" ON practitioner_calendar_blocks;
CREATE POLICY "staff_manage_practitioner_calendar_blocks"
  ON practitioner_calendar_blocks FOR ALL
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

ALTER PUBLICATION supabase_realtime ADD TABLE practitioner_calendar_blocks;

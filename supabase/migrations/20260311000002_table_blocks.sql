-- Reserve NI: add table_blocks for operational holds

CREATE TABLE IF NOT EXISTS table_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  table_id uuid NOT NULL REFERENCES venue_tables (id) ON DELETE CASCADE,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES staff (id),
  CONSTRAINT table_blocks_time_check CHECK (end_at > start_at)
);

CREATE INDEX IF NOT EXISTS idx_table_blocks_venue_time ON table_blocks (venue_id, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_table_blocks_table_time ON table_blocks (table_id, start_at, end_at);

ALTER TABLE table_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_manage_table_blocks" ON table_blocks;
CREATE POLICY "staff_manage_table_blocks"
  ON table_blocks FOR ALL
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

ALTER PUBLICATION supabase_realtime ADD TABLE table_blocks;

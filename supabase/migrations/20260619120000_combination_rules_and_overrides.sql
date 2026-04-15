-- Table combination rules: auto overrides (keyed by sorted table ids) + extended custom combinations.

-- 1) Auto-detected combination overrides (never stores the auto list itself — only overrides)
CREATE TABLE combination_auto_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  table_group_key text NOT NULL,
  disabled boolean NOT NULL DEFAULT false,
  display_name text,
  combined_min_covers int,
  combined_max_covers int,
  days_of_week smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::smallint[],
  time_start time without time zone,
  time_end time without time zone,
  booking_type_filters jsonb,
  requires_manager_approval boolean NOT NULL DEFAULT false,
  internal_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT combination_auto_overrides_venue_key UNIQUE (venue_id, table_group_key),
  CONSTRAINT combination_auto_overrides_time_order CHECK (
    time_start IS NULL OR time_end IS NULL OR time_end > time_start
  )
);

CREATE INDEX idx_combination_auto_overrides_venue ON combination_auto_overrides (venue_id);

COMMENT ON TABLE combination_auto_overrides IS
  'Overrides for auto-detected adjacent table groups (key = sorted table UUIDs joined with |).';

-- 2) Extend custom combinations with the same scheduling / approval fields
ALTER TABLE table_combinations
  ADD COLUMN IF NOT EXISTS table_group_key text,
  ADD COLUMN IF NOT EXISTS days_of_week smallint[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6,7]::smallint[],
  ADD COLUMN IF NOT EXISTS time_start time without time zone,
  ADD COLUMN IF NOT EXISTS time_end time without time zone,
  ADD COLUMN IF NOT EXISTS booking_type_filters jsonb,
  ADD COLUMN IF NOT EXISTS requires_manager_approval boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS internal_notes text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_valid boolean NOT NULL DEFAULT true;

ALTER TABLE table_combinations
  ADD CONSTRAINT table_combinations_time_order CHECK (
    time_start IS NULL OR time_end IS NULL OR time_end > time_start
  );

-- Unique custom combination by set of tables per venue (nullable key until backfilled)
CREATE UNIQUE INDEX IF NOT EXISTS table_combinations_venue_group_key_unique
  ON table_combinations (venue_id, table_group_key)
  WHERE table_group_key IS NOT NULL;

-- 3) RLS for combination_auto_overrides (mirror table_combinations pattern)
ALTER TABLE combination_auto_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_combination_auto_overrides"
  ON combination_auto_overrides FOR ALL
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

-- 4) Service role / staff access via Supabase — policies use staff table; ensure anon cannot read (handled by app)

-- 5) When a member is removed and fewer than 2 members remain, delete the combination
CREATE OR REPLACE FUNCTION fn_cleanup_table_combination_after_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  cnt int;
BEGIN
  SELECT COUNT(*) INTO cnt FROM table_combination_members WHERE combination_id = OLD.combination_id;
  IF cnt < 2 THEN
    DELETE FROM table_combinations WHERE id = OLD.combination_id;
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_combination_member_after_delete ON table_combination_members;
CREATE TRIGGER trg_combination_member_after_delete
  AFTER DELETE ON table_combination_members
  FOR EACH ROW
  EXECUTE FUNCTION fn_cleanup_table_combination_after_member();

-- Link calendar_blocks to class_instances so teaching blocks are removed when the instance is deleted
-- or can be found for updates / cancellation.

ALTER TABLE calendar_blocks
  ADD COLUMN IF NOT EXISTS class_instance_id uuid REFERENCES class_instances(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_calendar_blocks_class_instance_unique
  ON calendar_blocks (class_instance_id)
  WHERE class_instance_id IS NOT NULL;

COMMENT ON COLUMN calendar_blocks.class_instance_id IS
  'When set, this block reserves the calendar while the staff member is teaching this class instance.';

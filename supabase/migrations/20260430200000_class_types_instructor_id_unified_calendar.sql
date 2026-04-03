-- Allow class_types.instructor_id to reference unified_calendars (USE) as well as legacy practitioners.
-- Guest-facing label remains in instructor_name when needed.

ALTER TABLE class_types DROP CONSTRAINT IF EXISTS class_types_instructor_id_fkey;

COMMENT ON COLUMN class_types.instructor_id IS
  'Optional: legacy practitioners.id, or unified_calendars.id for USE venues. Display name in instructor_name for guests.';

-- Allow combination detection distance as low as 5 (was 20).
ALTER TABLE venues DROP CONSTRAINT IF EXISTS venues_combination_threshold_range;

ALTER TABLE venues
  ADD CONSTRAINT venues_combination_threshold_range
  CHECK (combination_threshold BETWEEN 5 AND 300);

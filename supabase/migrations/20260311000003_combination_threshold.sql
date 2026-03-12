-- Reserve NI: automatic table combination threshold
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS combination_threshold int NOT NULL DEFAULT 80;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'venues_combination_threshold_range'
  ) THEN
    ALTER TABLE venues
      ADD CONSTRAINT venues_combination_threshold_range
      CHECK (combination_threshold BETWEEN 20 AND 300);
  END IF;
END $$;

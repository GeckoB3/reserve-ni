-- Class types: payment_requirement enum (replaces requires_online_payment boolean)
-- Class timetable: recurrence metadata for generation

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_payment_requirement') THEN
    CREATE TYPE class_payment_requirement AS ENUM ('none', 'deposit', 'full_payment');
  END IF;
END $$;

ALTER TABLE class_types
  ADD COLUMN IF NOT EXISTS payment_requirement class_payment_requirement,
  ADD COLUMN IF NOT EXISTS deposit_amount_pence integer;

UPDATE class_types
SET payment_requirement = CASE
  WHEN requires_online_payment = true AND price_pence IS NOT NULL AND price_pence > 0 THEN 'full_payment'::class_payment_requirement
  ELSE 'none'::class_payment_requirement
END
WHERE payment_requirement IS NULL;

ALTER TABLE class_types ALTER COLUMN payment_requirement SET DEFAULT 'none'::class_payment_requirement;
ALTER TABLE class_types ALTER COLUMN payment_requirement SET NOT NULL;

ALTER TABLE class_types DROP COLUMN IF EXISTS requires_online_payment;

COMMENT ON COLUMN class_types.payment_requirement IS 'none = pay at venue or free; deposit = Stripe deposit per person; full_payment = charge full price online.';
COMMENT ON COLUMN class_types.deposit_amount_pence IS 'Per-person deposit when payment_requirement = deposit; must be <= price_pence.';

ALTER TABLE class_timetable
  ADD COLUMN IF NOT EXISTS recurrence_type text NOT NULL DEFAULT 'weekly',
  ADD COLUMN IF NOT EXISTS recurrence_end_date date,
  ADD COLUMN IF NOT EXISTS total_occurrences integer;

COMMENT ON COLUMN class_timetable.recurrence_type IS 'weekly | custom_interval (interval_weeks 1–8); monthly generation not yet implemented.';
COMMENT ON COLUMN class_timetable.recurrence_end_date IS 'Optional: do not generate instances after this date for this rule.';
COMMENT ON COLUMN class_timetable.total_occurrences IS 'Optional: stop after this many generated sessions for this rule (from first occurrence).';

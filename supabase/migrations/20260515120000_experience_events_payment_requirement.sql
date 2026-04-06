-- Add payment requirement and deposit fields to experience_events,
-- mirroring the pattern already used on class_types.

ALTER TABLE experience_events
  ADD COLUMN IF NOT EXISTS payment_requirement text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS deposit_amount_pence int;

COMMENT ON COLUMN experience_events.payment_requirement IS
  'none = pay at venue; deposit = partial online; full_payment = full charge online';

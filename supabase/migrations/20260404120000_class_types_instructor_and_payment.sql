-- Class types: guest-facing instructor label + optional pay-at-venue (skip Stripe when price is informational)

ALTER TABLE class_types
  ADD COLUMN IF NOT EXISTS instructor_name text,
  ADD COLUMN IF NOT EXISTS requires_online_payment boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN class_types.instructor_name IS 'Display instructor when instructor_id is null, or override label for guests.';
COMMENT ON COLUMN class_types.requires_online_payment IS 'When false, online booking does not collect Stripe payment even if price_pence is set (pay at venue / free checkout).';

-- Per-service online payment mode for appointments (reuses class_payment_requirement).
-- none = no online charge; deposit = fixed deposit; full_payment = charge full list price online.

ALTER TABLE appointment_services
  ADD COLUMN IF NOT EXISTS payment_requirement class_payment_requirement NOT NULL DEFAULT 'none';

UPDATE appointment_services
SET payment_requirement = 'deposit'::class_payment_requirement
WHERE deposit_pence IS NOT NULL AND deposit_pence > 0;

COMMENT ON COLUMN appointment_services.payment_requirement IS 'none = no online payment; deposit = Stripe deposit (deposit_pence); full_payment = charge full price online.';

ALTER TABLE service_items
  ADD COLUMN IF NOT EXISTS payment_requirement class_payment_requirement NOT NULL DEFAULT 'none';

UPDATE service_items
SET payment_requirement = 'deposit'::class_payment_requirement
WHERE deposit_pence IS NOT NULL AND deposit_pence > 0;

COMMENT ON COLUMN service_items.payment_requirement IS 'Same as appointment_services: how much to charge online at booking.';

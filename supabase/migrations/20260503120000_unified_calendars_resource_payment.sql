-- Resource payment settings on unified_calendars (calendar_type = 'resource').
-- Reuses class_payment_requirement enum from class types.

ALTER TABLE unified_calendars
  ADD COLUMN IF NOT EXISTS payment_requirement class_payment_requirement NOT NULL DEFAULT 'none';

ALTER TABLE unified_calendars
  ADD COLUMN IF NOT EXISTS deposit_amount_pence integer;

COMMENT ON COLUMN unified_calendars.payment_requirement IS 'For calendar_type=resource: none = pay at venue; deposit = Stripe deposit per booking; full_payment = charge full slot total online.';
COMMENT ON COLUMN unified_calendars.deposit_amount_pence IS 'Total deposit (pence) for one resource booking when payment_requirement = deposit.';

-- Preserve previous behaviour: priced resources charged full amount online.
UPDATE unified_calendars
SET payment_requirement = 'full_payment'::class_payment_requirement
WHERE calendar_type = 'resource'
  AND COALESCE(price_per_slot_pence, 0) > 0;

-- Snapshot how payment was configured when the guest booked (resource bookings only).
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS resource_payment_requirement class_payment_requirement;

COMMENT ON COLUMN bookings.resource_payment_requirement IS 'Set for resource_booking: payment mode at time of booking for staff display.';

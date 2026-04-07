-- Per-service table deposits: amount and online gating on booking_restrictions (service engine).

ALTER TABLE booking_restrictions
  ADD COLUMN IF NOT EXISTS deposit_amount_per_person_gbp numeric(10,2),
  ADD COLUMN IF NOT EXISTS online_requires_deposit boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN booking_restrictions.deposit_amount_per_person_gbp IS 'Per-person deposit in GBP for this dining service; null uses legacy venues.deposit_config.amount_per_person_gbp when present.';
COMMENT ON COLUMN booking_restrictions.online_requires_deposit IS 'When deposits apply for this service, require them for online/widget bookings.';

UPDATE booking_restrictions br
SET
  deposit_amount_per_person_gbp = COALESCE(
    NULLIF(trim(v.deposit_config->>'amount_per_person_gbp'), '')::numeric,
    5
  ),
  online_requires_deposit = COALESCE((v.deposit_config->>'online_requires_deposit')::boolean, true)
FROM venue_services vs
INNER JOIN venues v ON v.id = vs.venue_id
WHERE br.service_id = vs.id
  AND COALESCE((v.deposit_config->>'enabled')::boolean, false) = true
  AND br.deposit_amount_per_person_gbp IS NULL;

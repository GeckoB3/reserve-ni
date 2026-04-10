-- When per-service deposits are enabled, public booking must collect online; align legacy rows.
UPDATE booking_restrictions
SET online_requires_deposit = true
WHERE deposit_required_from_party_size IS NOT NULL;

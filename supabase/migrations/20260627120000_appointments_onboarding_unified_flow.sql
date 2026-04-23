-- Unified appointments onboarding uses the same step order for Pro, Plus, and Light (Stripe near the end).
-- Plus previously used a shorter generic step list; `appointments_onboarding_unified_flow` gates one-time index migration.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS appointments_onboarding_unified_flow boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN venues.appointments_onboarding_unified_flow IS
  'True when venues.onboarding_step indices follow the unified appointments wizard. Pro/Light have used it in-app for a long time; Plus may be migrated once from the legacy generic layout.';

UPDATE venues
SET appointments_onboarding_unified_flow = true
WHERE lower(trim(pricing_tier)) IN ('appointments', 'light');

-- Reserve NI: Pricing tiers, subscription billing, and onboarding state
-- Adds pricing/subscription columns to venues for Stripe Billing integration
-- and onboarding progress tracking.

-- =============================================================================
-- VENUES: add pricing, subscription, and onboarding columns
-- =============================================================================

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS pricing_tier text NOT NULL DEFAULT 'business',
  ADD COLUMN IF NOT EXISTS plan_status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS stripe_customer_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS stripe_subscription_item_id text,
  ADD COLUMN IF NOT EXISTS calendar_count int DEFAULT 1,
  ADD COLUMN IF NOT EXISTS onboarding_step int NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS founding_free_period_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS organisation_id uuid;

-- Existing venues default to business tier, active, onboarding completed.
-- New venues created via the signup flow will have onboarding_completed = false
-- and will be directed through the onboarding wizard.

COMMENT ON COLUMN venues.pricing_tier IS 'standard | business | founding';
COMMENT ON COLUMN venues.plan_status IS 'active | past_due | cancelled | trialing';
COMMENT ON COLUMN venues.stripe_customer_id IS 'Stripe Customer ID for billing (separate from Connect account)';
COMMENT ON COLUMN venues.stripe_subscription_id IS 'Active Stripe subscription ID';
COMMENT ON COLUMN venues.stripe_subscription_item_id IS 'Subscription item ID for quantity updates (Standard tier)';
COMMENT ON COLUMN venues.calendar_count IS 'Number of paid calendars (Standard tier); null for Business';
COMMENT ON COLUMN venues.onboarding_step IS 'Current step in the onboarding wizard (0-based)';
COMMENT ON COLUMN venues.onboarding_completed IS 'Whether the venue has completed initial onboarding';
COMMENT ON COLUMN venues.founding_free_period_ends_at IS 'When the founding partner free period expires';
COMMENT ON COLUMN venues.organisation_id IS 'Future: multi-venue grouping';

-- Index for subscription lookups from webhook handlers
CREATE INDEX IF NOT EXISTS idx_venues_stripe_customer ON venues (stripe_customer_id) WHERE stripe_customer_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_venues_stripe_subscription ON venues (stripe_subscription_id) WHERE stripe_subscription_id IS NOT NULL;

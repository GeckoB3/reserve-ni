-- Billing: store current subscription period end for Plan UI (cancel-at-period-end messaging).

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS subscription_current_period_end timestamptz;

COMMENT ON COLUMN venues.subscription_current_period_end IS 'End of current Stripe subscription billing period (UTC). Updated from subscription webhooks.';

COMMENT ON COLUMN venues.plan_status IS 'active | past_due | cancelled | cancelling | trialing. Use cancelling when Stripe subscription has cancel_at_period_end=true.';

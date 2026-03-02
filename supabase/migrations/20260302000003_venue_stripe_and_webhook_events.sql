-- Reserve NI: Venue Stripe Connect + webhook idempotency

-- Venues: store connected Stripe account for direct charges
ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS stripe_connected_account_id text;

CREATE INDEX IF NOT EXISTS idx_venues_stripe_account ON venues (stripe_connected_account_id) WHERE stripe_connected_account_id IS NOT NULL;

-- Webhook events: idempotency for Stripe webhooks (process each event once)
CREATE TABLE IF NOT EXISTS webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_event_id text NOT NULL UNIQUE,
  event_type text NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON webhook_events (stripe_event_id);

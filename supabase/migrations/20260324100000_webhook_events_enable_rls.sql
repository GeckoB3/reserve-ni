-- Stripe webhook idempotency table: server uses service role only (bypasses RLS).
-- Enable RLS so anon/authenticated cannot read or write via PostgREST.
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

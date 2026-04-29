-- Phase 2: class commerce ledgers — checkout audit, payment allocations, membership allowance,
-- course session links, recurring materialization events. Service-role access; RLS deny-by-default.

-- -----------------------------------------------------------------------------
-- Checkout header (one row per class-commerce PaymentIntent)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_checkout_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  group_booking_id uuid REFERENCES public.class_booking_groups (id) ON DELETE SET NULL,
  stripe_payment_intent_id text NOT NULL,
  purpose text NOT NULL,
  amount_pence int NOT NULL CHECK (amount_pence >= 0),
  currency text NOT NULL DEFAULT 'gbp',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_checkout_transactions_pi_uq UNIQUE (stripe_payment_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_class_checkout_transactions_venue
  ON public.class_checkout_transactions (venue_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Per-booking slice of a checkout (revenue allocation / audit)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_payment_allocations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_transaction_id uuid NOT NULL REFERENCES public.class_checkout_transactions (id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.bookings (id) ON DELETE CASCADE,
  amount_pence int NOT NULL CHECK (amount_pence >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_payment_allocations_checkout
  ON public.class_payment_allocations (checkout_transaction_id);
CREATE INDEX IF NOT EXISTS idx_class_payment_allocations_booking
  ON public.class_payment_allocations (booking_id);

-- -----------------------------------------------------------------------------
-- Membership session allowance movements (redeem / restore / period reset)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_membership_allowance_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.class_memberships (id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  delta_sessions int NOT NULL,
  reason text NOT NULL CHECK (
    reason IN ('redeem', 'restore', 'period_reset', 'admin_adjust', 'payment_reversal')
  ),
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  idempotency_key text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS class_membership_allowance_ledger_idem_uq
  ON public.class_membership_allowance_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_membership_allowance_membership
  ON public.class_membership_allowance_ledger (membership_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- Course enrollment ↔ scheduled session instance
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_course_session_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  enrollment_id uuid NOT NULL REFERENCES public.class_course_enrollments (id) ON DELETE CASCADE,
  class_instance_id uuid NOT NULL REFERENCES public.class_instances (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'attended', 'cancelled', 'no_show')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_course_session_enrollments_uq UNIQUE (enrollment_id, class_instance_id)
);

CREATE INDEX IF NOT EXISTS idx_class_course_session_enroll_instance
  ON public.class_course_session_enrollments (class_instance_id);

-- -----------------------------------------------------------------------------
-- Recurring reservation materialization audit
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_recurring_materialization_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reservation_id uuid NOT NULL REFERENCES public.class_recurring_reservations (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('success', 'partial', 'failed', 'skipped')),
  booking_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  error text,
  run_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_recurring_materialize_reservation
  ON public.class_recurring_materialization_events (reservation_id, run_at DESC);

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.class_checkout_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_membership_allowance_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_course_session_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_recurring_materialization_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE public.class_checkout_transactions IS
  'Stripe PaymentIntent audit for class-commerce flows (cart, future course checkout, etc.).';
COMMENT ON TABLE public.class_membership_allowance_ledger IS
  'Session-based membership allowance consumption and restores (FIFO / rules in application layer).';

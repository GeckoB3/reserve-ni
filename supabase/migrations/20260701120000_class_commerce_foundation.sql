-- Reserve NI: class commerce foundation (credits, courses, memberships, recurring, per-venue Stripe customers).
-- Accessed via service-role API routes; RLS enabled without policies = deny direct PostgREST, allow service_role.

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_credit_ledger_reason') THEN
    CREATE TYPE public.class_credit_ledger_reason AS ENUM (
      'purchase',
      'redeem',
      'refund',
      'expire',
      'admin_adjust'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_course_enrollment_status') THEN
    CREATE TYPE public.class_course_enrollment_status AS ENUM (
      'pending_payment',
      'active',
      'cancelled',
      'completed'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_membership_status') THEN
    CREATE TYPE public.class_membership_status AS ENUM (
      'trialing',
      'active',
      'past_due',
      'canceled',
      'paused',
      'incomplete'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'class_recurring_reservation_status') THEN
    CREATE TYPE public.class_recurring_reservation_status AS ENUM (
      'active',
      'paused',
      'cancelled',
      'failed'
    );
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- Per-venue Stripe Customer on the venue connected account (saved PM scope)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.venue_customer_stripe (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  stripe_connected_account_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  default_payment_method_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT venue_customer_stripe_unique UNIQUE (user_id, venue_id)
);

CREATE INDEX IF NOT EXISTS idx_venue_customer_stripe_venue ON public.venue_customer_stripe (venue_id);

COMMENT ON TABLE public.venue_customer_stripe IS
  'Stripe Customer on the venue connected account for end-customer saved cards and subscription billing.';

-- -----------------------------------------------------------------------------
-- Credit packs (venue products)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_credit_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  credits_count int NOT NULL CHECK (credits_count > 0),
  price_pence int NOT NULL CHECK (price_pence >= 0),
  currency text NOT NULL DEFAULT 'gbp',
  validity_days int CHECK (validity_days IS NULL OR validity_days > 0),
  eligible_class_type_ids uuid[] DEFAULT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_credit_products_venue ON public.class_credit_products (venue_id);

-- -----------------------------------------------------------------------------
-- Credit balance batches (one row per purchase grant or admin grant)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_class_credit_balances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.class_credit_products (id) ON DELETE RESTRICT,
  credits_remaining int NOT NULL CHECK (credits_remaining >= 0),
  expires_at timestamptz,
  purchased_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_class_credit_balances_user_venue
  ON public.user_class_credit_balances (user_id, venue_id);
CREATE INDEX IF NOT EXISTS idx_user_class_credit_balances_expiry
  ON public.user_class_credit_balances (venue_id, expires_at);

-- -----------------------------------------------------------------------------
-- Append-only style ledger (every mutation has a row)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_credit_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  balance_id uuid REFERENCES public.user_class_credit_balances (id) ON DELETE SET NULL,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  delta_credits int NOT NULL,
  reason public.class_credit_ledger_reason NOT NULL,
  booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  stripe_payment_intent_id text,
  idempotency_key text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS class_credit_ledger_idempotency_key_uq
  ON public.class_credit_ledger (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_credit_ledger_user_venue ON public.class_credit_ledger (user_id, venue_id);
CREATE INDEX IF NOT EXISTS idx_class_credit_ledger_booking ON public.class_credit_ledger (booking_id);

-- -----------------------------------------------------------------------------
-- Fulfillment guard for credit purchases (webhook + client confirm)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_credit_purchase_fulfillments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stripe_payment_intent_id text NOT NULL UNIQUE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.class_credit_products (id) ON DELETE RESTRICT,
  balance_id uuid REFERENCES public.user_class_credit_balances (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- -----------------------------------------------------------------------------
-- Course products & enrollments
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_course_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price_pence int NOT NULL CHECK (price_pence >= 0),
  currency text NOT NULL DEFAULT 'gbp',
  max_enrollments int CHECK (max_enrollments IS NULL OR max_enrollments > 0),
  opens_at timestamptz,
  closes_at timestamptz,
  session_instance_ids uuid[] NOT NULL DEFAULT '{}'::uuid[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_course_products_venue ON public.class_course_products (venue_id);

CREATE TABLE IF NOT EXISTS public.class_course_enrollments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  course_product_id uuid NOT NULL REFERENCES public.class_course_products (id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  guest_id uuid REFERENCES public.guests (id) ON DELETE SET NULL,
  status public.class_course_enrollment_status NOT NULL DEFAULT 'pending_payment',
  stripe_payment_intent_id text,
  idempotency_key text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT class_course_enrollments_idempotency_uq UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_class_course_enrollments_user ON public.class_course_enrollments (user_id, venue_id);

-- -----------------------------------------------------------------------------
-- Membership products & mirror subscriptions
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_membership_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  stripe_price_id text,
  currency text NOT NULL DEFAULT 'gbp',
  rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_membership_products_venue ON public.class_membership_products (venue_id);

CREATE TABLE IF NOT EXISTS public.class_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.class_membership_products (id) ON DELETE RESTRICT,
  stripe_subscription_id text,
  stripe_customer_id text,
  status public.class_membership_status NOT NULL DEFAULT 'incomplete',
  current_period_end timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS class_memberships_stripe_sub_uq
  ON public.class_memberships (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_class_memberships_user_venue ON public.class_memberships (user_id, venue_id);

-- -----------------------------------------------------------------------------
-- Booking group metadata (links to bookings.group_booking_id)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_booking_groups (
  id uuid PRIMARY KEY,
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('multi_session', 'course', 'recurring_materialization')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_booking_groups_venue ON public.class_booking_groups (venue_id);

-- -----------------------------------------------------------------------------
-- Recurring guest reservations (standing bookings)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_recurring_reservations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  class_type_id uuid NOT NULL REFERENCES public.class_types (id) ON DELETE CASCADE,
  rule jsonb NOT NULL DEFAULT '{}'::jsonb,
  status public.class_recurring_reservation_status NOT NULL DEFAULT 'active',
  next_materialize_on date,
  last_materialized_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_class_recurring_user ON public.class_recurring_reservations (user_id, venue_id);

-- -----------------------------------------------------------------------------
-- RLS: deny default client access; service role bypasses RLS.
-- -----------------------------------------------------------------------------
ALTER TABLE public.venue_customer_stripe ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_credit_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_class_credit_balances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_credit_ledger ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_credit_purchase_fulfillments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_course_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_course_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_membership_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_booking_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_recurring_reservations ENABLE ROW LEVEL SECURITY;

-- Track failed deposit payment attempts (Stripe payment_intent.payment_failed).

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'deposit_status'
      AND e.enumlabel = 'Failed'
  ) THEN
    ALTER TYPE deposit_status ADD VALUE 'Failed';
  END IF;
END $$;

-- Reserve NI: add Waived deposit status used by staff actions.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'deposit_status'
      AND e.enumlabel = 'Waived'
  ) THEN
    ALTER TYPE deposit_status ADD VALUE 'Waived';
  END IF;
END
$$;


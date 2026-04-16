-- Reserve NI: custom enums for venues, staff, and bookings
-- Idempotent: Supabase Preview / branched DBs may already include these types.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_role') THEN
    CREATE TYPE staff_role AS ENUM ('admin', 'staff');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_status') THEN
    CREATE TYPE booking_status AS ENUM (
      'Pending',
      'Confirmed',
      'Cancelled',
      'No-Show',
      'Completed',
      'Seated'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'booking_source') THEN
    CREATE TYPE booking_source AS ENUM ('online', 'phone', 'walk-in');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deposit_status') THEN
    CREATE TYPE deposit_status AS ENUM (
      'Not Required',
      'Pending',
      'Paid',
      'Refunded',
      'Forfeited'
    );
  END IF;
END $$;

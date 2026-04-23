-- Add `Booked` to the booking_status enum.
--
-- Today, `Confirmed` is overloaded: it is both the default state of a fresh
-- booking ("we hold the slot") AND the conceptual "guest has confirmed they're
-- coming" state. We are splitting the two:
--   • `Booked`    — booking exists, slot held (replaces today's `Confirmed`
--                   as the default).
--   • `Confirmed` — guest tapped the confirm/cancel link OR a staff member
--                   manually marked attendance confirmed.
--
-- Because `ALTER TYPE … ADD VALUE` cannot be used in the same transaction as
-- DML against the new value (older PG / Supabase compatibility), the data
-- backfill lives in a follow-up migration.

ALTER TYPE booking_status ADD VALUE IF NOT EXISTS 'Booked' AFTER 'Pending';

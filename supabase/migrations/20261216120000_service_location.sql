-- Service location: where an appointment service is delivered.
-- 'business_venue' (default, current behaviour), 'client_address' (staff travel to the
-- client; booking collects a mandatory address), or 'online' (remote; service stores a
-- meeting link + joining info shown in confirmation/reminder emails instead of the venue
-- address).

-- ── Services (legacy Model B table) ──────────────────────────────────────────
ALTER TABLE appointment_services
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'business_venue',
  ADD COLUMN IF NOT EXISTS online_meeting_url text,
  ADD COLUMN IF NOT EXISTS online_meeting_info text;

DO $$ BEGIN
  ALTER TABLE appointment_services
    ADD CONSTRAINT appointment_services_location_type_check
    CHECK (location_type IN ('business_venue', 'client_address', 'online'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Services (unified scheduling table) ──────────────────────────────────────
ALTER TABLE service_items
  ADD COLUMN IF NOT EXISTS location_type text NOT NULL DEFAULT 'business_venue',
  ADD COLUMN IF NOT EXISTS online_meeting_url text,
  ADD COLUMN IF NOT EXISTS online_meeting_info text;

DO $$ BEGIN
  ALTER TABLE service_items
    ADD CONSTRAINT service_items_location_type_check
    CHECK (location_type IN ('business_venue', 'client_address', 'online'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Bookings: location snapshot at booking time ───────────────────────────────
-- location_type NULL = legacy rows / business venue. The client address is captured
-- per booking (the address for THIS visit) so later guest-record edits don't rewrite
-- history, and emails for the booking always show the address that was agreed.
ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS location_type text,
  ADD COLUMN IF NOT EXISTS client_address_line1 text,
  ADD COLUMN IF NOT EXISTS client_address_line2 text,
  ADD COLUMN IF NOT EXISTS client_address_city text,
  ADD COLUMN IF NOT EXISTS client_address_postcode text;

DO $$ BEGIN
  ALTER TABLE bookings
    ADD CONSTRAINT bookings_location_type_check
    CHECK (location_type IS NULL OR location_type IN ('business_venue', 'client_address', 'online'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── Guests: address kept on the contact record ────────────────────────────────
ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS address_line1 text,
  ADD COLUMN IF NOT EXISTS address_line2 text,
  ADD COLUMN IF NOT EXISTS address_city text,
  ADD COLUMN IF NOT EXISTS address_postcode text;

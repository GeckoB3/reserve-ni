-- Date-scoped yield overrides on blocks + schedule / booking rule exceptions

ALTER TABLE availability_blocks
  ADD COLUMN IF NOT EXISTS yield_overrides jsonb;

-- Optional per-date overrides for booking restrictions (nullable columns = no change to base rule)
CREATE TABLE booking_restriction_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  service_id uuid REFERENCES venue_services (id) ON DELETE CASCADE,
  date_start date NOT NULL,
  date_end date NOT NULL,
  time_start time,
  time_end time,
  min_advance_minutes int,
  max_advance_days int,
  min_party_size_online int,
  max_party_size_online int,
  large_party_threshold int,
  large_party_message text,
  deposit_required_from_party_size int,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_booking_restriction_exceptions_venue_dates
  ON booking_restriction_exceptions (venue_id, date_start, date_end);

-- Per-date service window overrides (closed or custom times)
CREATE TABLE service_schedule_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  service_id uuid NOT NULL REFERENCES venue_services (id) ON DELETE CASCADE,
  date_start date NOT NULL,
  date_end date NOT NULL,
  is_closed boolean NOT NULL DEFAULT false,
  opens_extra_day boolean NOT NULL DEFAULT false,
  start_time time,
  end_time time,
  last_booking_time time,
  reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_service_schedule_exceptions_venue_dates
  ON service_schedule_exceptions (venue_id, date_start, date_end);

ALTER TABLE booking_restriction_exceptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_schedule_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_booking_restriction_exceptions"
  ON booking_restriction_exceptions FOR ALL
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "staff_manage_service_schedule_exceptions"
  ON service_schedule_exceptions FOR ALL
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  )
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "public_read_booking_restriction_exceptions"
  ON booking_restriction_exceptions FOR SELECT
  TO anon
  USING (true);

CREATE POLICY "public_read_service_schedule_exceptions"
  ON service_schedule_exceptions FOR SELECT
  TO anon
  USING (true);

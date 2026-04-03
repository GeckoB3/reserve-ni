-- Reserve NI: Row-Level Security - staff can only read/write data for their venue(s)
-- Staff are identified by email from Supabase Auth JWT (auth.jwt() ->> 'email').

ALTER TABLE venues ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE guests ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE events ENABLE ROW LEVEL SECURITY;

-- Helper: venue_ids the current user (staff email) is associated with
-- Returns empty set if not authenticated or not in staff table.

-- venues: staff can view and update their venue(s)
CREATE POLICY "staff_select_own_venue"
  ON venues FOR SELECT
  USING (
    id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "staff_update_own_venue"
  ON venues FOR UPDATE
  USING (
    id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- staff: staff can view their own row(s) (one per venue)
CREATE POLICY "staff_select_own"
  ON staff FOR SELECT
  USING (email = (auth.jwt() ->> 'email'));

-- guests: staff can manage guests for their venue(s)
CREATE POLICY "staff_manage_guests"
  ON guests FOR ALL
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

-- bookings: staff can manage bookings for their venue(s)
CREATE POLICY "staff_manage_bookings"
  ON bookings FOR ALL
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

-- events: staff can view and insert events for their venue(s); no update/delete
CREATE POLICY "staff_select_events"
  ON events FOR SELECT
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

CREATE POLICY "staff_insert_events"
  ON events FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

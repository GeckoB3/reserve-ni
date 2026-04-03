-- Reserve NI: Staff table - allow staff to see all staff for their venue(s); allow admins to insert.

-- Drop the restrictive select so we can allow venue-scoped select
DROP POLICY IF EXISTS "staff_select_own" ON staff;

-- Staff can see all staff rows for venues they belong to
CREATE POLICY "staff_select_venue_staff"
  ON staff FOR SELECT
  USING (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
    )
  );

-- Only admins can add new staff to their venue
CREATE POLICY "staff_admin_insert"
  ON staff FOR INSERT
  WITH CHECK (
    venue_id IN (
      SELECT venue_id FROM staff
      WHERE email = (auth.jwt() ->> 'email')
      AND role = 'admin'
    )
  );

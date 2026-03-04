-- Reserve NI: Fix staff RLS so users can see their own staff row(s) again.
-- The policy "staff_select_venue_staff" alone is circular: it allows SELECT where
-- venue_id IN (SELECT venue_id FROM staff WHERE email = JWT). The subquery is
-- RLS-filtered, so no rows are visible until the subquery returns venue_ids,
-- so staff get "No venue linked". Restore the ability to select own row by email.

CREATE POLICY "staff_select_own"
  ON staff FOR SELECT
  USING (email = (auth.jwt() ->> 'email'));

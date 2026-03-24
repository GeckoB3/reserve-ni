-- Frequent identifiable guests for venue reports (email or phone on file; walk-ins without both excluded).

CREATE OR REPLACE FUNCTION report_frequent_visitors(
  p_venue_id uuid,
  p_start date,
  p_end date,
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  guest_id uuid,
  name text,
  email text,
  phone text,
  visit_count int,
  last_visit_date date,
  bookings_in_period int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    g.id AS guest_id,
    g.name,
    g.email,
    g.phone,
    g.visit_count,
    g.last_visit_date,
    (
      SELECT COUNT(*)::int
      FROM bookings b
      WHERE b.guest_id = g.id
        AND b.venue_id = p_venue_id
        AND b.booking_date >= p_start
        AND b.booking_date <= p_end
        AND b.status <> 'Cancelled'::booking_status
    ) AS bookings_in_period
  FROM guests g
  WHERE g.venue_id = p_venue_id
    AND g.visit_count >= 1
    AND (
      (g.email IS NOT NULL AND btrim(g.email) <> '')
      OR (g.phone IS NOT NULL AND btrim(g.phone) <> '')
    )
    AND EXISTS (
      SELECT 1
      FROM bookings b2
      WHERE b2.guest_id = g.id
        AND b2.venue_id = p_venue_id
        AND b2.booking_date >= p_start
        AND b2.booking_date <= p_end
        AND b2.status <> 'Cancelled'::booking_status
    )
  ORDER BY g.visit_count DESC, g.last_visit_date DESC NULLS LAST, g.name ASC NULLS LAST
  LIMIT p_limit;
$$;

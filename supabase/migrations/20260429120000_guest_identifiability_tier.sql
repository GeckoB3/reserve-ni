-- Tier for guest directory filtering (identified / named / anonymous walk-ins)

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS identifiability_tier text
  GENERATED ALWAYS AS (
    CASE
      WHEN nullif(btrim(COALESCE(email, '')), '') IS NOT NULL
        OR nullif(btrim(COALESCE(phone, '')), '') IS NOT NULL THEN 'identified'
      WHEN (name IS NULL OR btrim(COALESCE(name, '')) = '' OR lower(btrim(COALESCE(name, ''))) = 'walk-in')
        AND nullif(btrim(COALESCE(email, '')), '') IS NULL
        AND nullif(btrim(COALESCE(phone, '')), '') IS NULL THEN 'anonymous'
      ELSE 'named'
    END
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_guests_venue_identifiability
  ON guests (venue_id, identifiability_tier);

COMMENT ON COLUMN guests.identifiability_tier IS
  'identified: has email or phone; named: real name without contact; anonymous: walk-in / no identity';

-- Aggregates for Reports > Clients tab (period + all-time identified count)
CREATE OR REPLACE FUNCTION public.report_client_summary(p_venue_id uuid, p_from date, p_to date)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH first_visit AS (
    SELECT b.guest_id, MIN(b.booking_date)::date AS first_dt
    FROM bookings b
    WHERE b.venue_id = p_venue_id
      AND b.status <> 'Cancelled'
    GROUP BY b.guest_id
  ),
  identified_guests AS (
    SELECT g.id
    FROM guests g
    WHERE g.venue_id = p_venue_id
      AND g.identifiability_tier = 'identified'
  ),
  in_period AS (
    SELECT DISTINCT b.guest_id
    FROM bookings b
    WHERE b.venue_id = p_venue_id
      AND b.status <> 'Cancelled'
      AND b.booking_date BETWEEN p_from AND p_to
  ),
  anon_visits AS (
    SELECT COUNT(*)::bigint AS c
    FROM bookings b
    INNER JOIN guests g ON g.id = b.guest_id AND g.venue_id = p_venue_id
    WHERE b.venue_id = p_venue_id
      AND b.status <> 'Cancelled'
      AND b.booking_date BETWEEN p_from AND p_to
      AND g.identifiability_tier = 'anonymous'
  )
  SELECT jsonb_build_object(
    'identified_clients_total',
      (SELECT COUNT(*)::bigint FROM identified_guests),
    'new_clients_in_period',
      (SELECT COUNT(*)::bigint
       FROM first_visit fv
       INNER JOIN identified_guests ig ON ig.id = fv.guest_id
       WHERE fv.first_dt BETWEEN p_from AND p_to),
    'returning_clients_in_period',
      (SELECT COUNT(*)::bigint
       FROM first_visit fv
       INNER JOIN identified_guests ig ON ig.id = fv.guest_id
       INNER JOIN in_period ip ON ip.guest_id = ig.id
       WHERE fv.first_dt < p_from),
    'anonymous_visits_in_period',
      (SELECT c FROM anon_visits)
  );
$$;

GRANT EXECUTE ON FUNCTION public.report_client_summary(uuid, date, date) TO authenticated, service_role;

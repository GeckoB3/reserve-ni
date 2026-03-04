-- Reserve NI: reconciliation_alerts table + reporting functions (events as source of truth)

-- Table for daily Stripe reconciliation discrepancies
CREATE TABLE reconciliation_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings (id) ON DELETE CASCADE,
  expected_status text NOT NULL,
  actual_stripe_status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_reconciliation_alerts_created ON reconciliation_alerts (created_at);

-- RLS: staff can read alerts for their venue
ALTER TABLE reconciliation_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY reconciliation_alerts_select ON reconciliation_alerts
  FOR SELECT
  USING (
    booking_id IN (
      SELECT id FROM bookings WHERE venue_id IN (
        SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')
      )
    )
  );

-- Insert only via service role (cron); no INSERT policy so authenticated users cannot insert.

-- Helper: latest status per booking from events (for venue + date range of event created_at)
CREATE OR REPLACE FUNCTION report_booking_final_statuses(
  p_venue_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS TABLE (
  booking_id uuid,
  source text,
  party_size int,
  booking_date date,
  booking_time time,
  final_status text,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH created_in_range AS (
    SELECT e.booking_id, e.created_at,
           (e.payload->>'source')::text AS source,
           (e.payload->>'party_size')::int AS party_size,
           (e.payload->>'booking_date')::date AS booking_date,
           (e.payload->>'booking_time')::text AS booking_time,
           (e.payload->>'status')::text AS initial_status
    FROM events e
    WHERE e.venue_id = p_venue_id
      AND e.event_type = 'booking_created'
      AND e.created_at >= p_start AND e.created_at < p_end
  ),
  status_events AS (
    SELECT e.booking_id, e.created_at,
           CASE WHEN e.event_type = 'booking_status_changed' THEN e.payload->>'new_status'
                ELSE e.payload->>'status' END AS status
    FROM events e
    JOIN created_in_range c ON c.booking_id = e.booking_id
    WHERE e.event_type IN ('booking_created', 'booking_status_changed')
  ),
  last_status AS (
    SELECT DISTINCT ON (booking_id) booking_id, status AS final_status
    FROM status_events
    ORDER BY booking_id, created_at DESC
  )
  SELECT c.booking_id, c.source, c.party_size, c.booking_date,
         (c.booking_time::time) AS booking_time,
         COALESCE(l.final_status, c.initial_status) AS final_status,
         c.created_at
  FROM created_in_range c
  LEFT JOIN last_status l ON l.booking_id = c.booking_id;
$$;

-- Report 1: Booking summary (from events)
CREATE OR REPLACE FUNCTION report_booking_summary(
  p_venue_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec record;
  total_created int := 0;
  by_source jsonb := '{}';
  by_status jsonb := '{}';
  covers_booked bigint := 0;
  covers_seated bigint := 0;
BEGIN
  WITH final AS (
    SELECT * FROM report_booking_final_statuses(p_venue_id, p_start, p_end)
  )
  SELECT
    COUNT(*)::int AS total_created,
    SUM(party_size)::bigint AS covers_booked,
    SUM(CASE WHEN final_status IN ('Seated', 'Completed') THEN party_size ELSE 0 END)::bigint AS seated
  INTO total_created, covers_booked, covers_seated
  FROM final;

  SELECT jsonb_object_agg(source, cnt) INTO by_source
  FROM (
    SELECT (payload->>'source')::text AS source, COUNT(*)::int AS cnt
    FROM events
    WHERE venue_id = p_venue_id AND event_type = 'booking_created'
      AND created_at >= p_start AND created_at < p_end
    GROUP BY payload->>'source'
  ) t;

  SELECT jsonb_object_agg(final_status, cnt) INTO by_status
  FROM (
    SELECT final_status, COUNT(*)::int AS cnt
    FROM report_booking_final_statuses(p_venue_id, p_start, p_end)
    GROUP BY final_status
  ) t;

  RETURN jsonb_build_object(
    'total_bookings_created', COALESCE(total_created, 0),
    'by_source', COALESCE(by_source, '{}'),
    'by_status', COALESCE(by_status, '{}'),
    'covers_booked', COALESCE(covers_booked, 0),
    'covers_seated', COALESCE(covers_seated, 0)
  );
END;
$$;

-- Report 2: No-show rate (bookings that reached reservation time in Confirmed, then No-Show; exclude walk-ins)
CREATE OR REPLACE FUNCTION report_no_show_series(
  p_venue_id uuid,
  p_start timestamptz,
  p_end timestamptz,
  p_granularity text DEFAULT 'day'
)
RETURNS TABLE (period_start date, no_show_count bigint, confirmed_at_time_count bigint, rate_pct numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH final AS (
    SELECT * FROM report_booking_final_statuses(p_venue_id, p_start, p_end)
    WHERE source != 'walk-in'
  ),
  by_period AS (
    SELECT
      CASE WHEN p_granularity = 'week' THEN date_trunc('week', created_at)::date ELSE created_at::date END AS period_start,
      COUNT(*) FILTER (WHERE final_status = 'No-Show') AS no_show_count,
      COUNT(*) FILTER (WHERE final_status IN ('No-Show', 'Seated', 'Completed')) AS confirmed_at_time_count
    FROM final
    GROUP BY 1
  )
  SELECT period_start,
         no_show_count,
         confirmed_at_time_count,
         CASE WHEN confirmed_at_time_count > 0
              THEN round(100.0 * no_show_count / NULLIF(confirmed_at_time_count, 0), 2)
              ELSE 0 END AS rate_pct
  FROM by_period
  ORDER BY period_start;
$$;

-- Report 3: Cancellation (guest-initiated = Confirmed -> Cancelled; auto = Pending -> Cancelled)
CREATE OR REPLACE FUNCTION report_cancellation(
  p_venue_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH created AS (
    SELECT COUNT(*)::int AS total
    FROM events
    WHERE venue_id = p_venue_id AND event_type = 'booking_created'
      AND created_at >= p_start AND created_at < p_end
  ),
  guest_cancel AS (
    SELECT COUNT(DISTINCT booking_id)::int AS cnt
    FROM events
    WHERE venue_id = p_venue_id AND event_type = 'booking_status_changed'
      AND payload->>'new_status' = 'Cancelled'
      AND payload->>'old_status' = 'Confirmed'
      AND created_at >= p_start AND created_at < p_end
  ),
  auto_cancel AS (
    SELECT COUNT(DISTINCT booking_id)::int AS cnt
    FROM events
    WHERE venue_id = p_venue_id AND event_type = 'booking_status_changed'
      AND payload->>'new_status' = 'Cancelled'
      AND payload->>'old_status' = 'Pending'
      AND created_at >= p_start AND created_at < p_end
  )
  SELECT jsonb_build_object(
    'total_bookings_created', (SELECT total FROM created),
    'cancelled_guest_initiated', (SELECT cnt FROM guest_cancel),
    'cancelled_auto', (SELECT cnt FROM auto_cancel),
    'cancellation_rate_pct', CASE WHEN (SELECT total FROM created) > 0
      THEN round(100.0 * ((SELECT cnt FROM guest_cancel) + (SELECT cnt FROM auto_cancel)) / (SELECT total FROM created), 2)
      ELSE 0 END
  );
$$;

-- Report 4: Deposit summary (from bookings — deposit state not in events)
-- We use bookings table filtered by created_at in range for consistency with "period"
CREATE OR REPLACE FUNCTION report_deposit_summary(
  p_venue_id uuid,
  p_start timestamptz,
  p_end timestamptz
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'total_collected_pence', COALESCE(SUM(deposit_amount_pence) FILTER (WHERE deposit_status IN ('Paid', 'Forfeited')), 0),
    'total_refunded_pence', COALESCE(SUM(deposit_amount_pence) FILTER (WHERE deposit_status = 'Refunded'), 0),
    'total_forfeited_pence', COALESCE(SUM(deposit_amount_pence) FILTER (WHERE deposit_status = 'Forfeited'), 0)
  )
  FROM bookings
  WHERE venue_id = p_venue_id
    AND created_at >= p_start AND created_at < p_end;
$$;

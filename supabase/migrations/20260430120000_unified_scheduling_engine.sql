-- Reserve NI: Unified Scheduling Engine (USE) — tables, enum value, bookings columns,
-- data copy from practitioners/appointment_services, RLS, SMS usage RPC.
-- Model A (table_reservation) unchanged in behaviour; legacy B tables kept.

-- =============================================================================
-- 1. booking_model enum: unified_scheduling
-- =============================================================================

DO $$
BEGIN
  ALTER TYPE booking_model ADD VALUE 'unified_scheduling';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END;
$$;

-- =============================================================================
-- 2. venues: subscription SMS item + allowance + notification_settings JSONB
-- =============================================================================

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS stripe_sms_subscription_item_id text,
  ADD COLUMN IF NOT EXISTS sms_monthly_allowance int NOT NULL DEFAULT 800,
  ADD COLUMN IF NOT EXISTS notification_settings jsonb NOT NULL DEFAULT '{
    "confirmation_enabled": true,
    "confirmation_channels": ["email", "sms"],
    "reminder_1_enabled": true,
    "reminder_1_hours_before": 24,
    "reminder_1_channels": ["email", "sms"],
    "reminder_2_enabled": true,
    "reminder_2_hours_before": 2,
    "reminder_2_channels": ["sms"],
    "reschedule_notification_enabled": true,
    "cancellation_notification_enabled": true,
    "no_show_notification_enabled": true,
    "post_visit_enabled": true,
    "post_visit_timing": "4_hours_after",
    "daily_schedule_enabled": false,
    "staff_new_booking_alert": true,
    "staff_cancellation_alert": true
  }'::jsonb;

COMMENT ON COLUMN venues.stripe_sms_subscription_item_id IS 'Subscription item for STRIPE_SMS_OVERAGE_PRICE_ID (metered).';
COMMENT ON COLUMN venues.sms_monthly_allowance IS 'Included SMS per month; 200 × calendar_count on Standard, 800 on Business.';
COMMENT ON COLUMN venues.notification_settings IS 'Unified scheduling notification toggles (USE); optional for restaurants.';

-- =============================================================================
-- 3. unified_calendars
-- =============================================================================

CREATE TABLE IF NOT EXISTS unified_calendars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text,
  description text,
  photo_url text,
  colour text NOT NULL DEFAULT '#3B82F6',
  calendar_type text NOT NULL DEFAULT 'practitioner',
  capacity int NOT NULL DEFAULT 1,
  parallel_clients int NOT NULL DEFAULT 1,
  working_hours jsonb NOT NULL DEFAULT '{}'::jsonb,
  break_times jsonb NOT NULL DEFAULT '[]'::jsonb,
  days_off jsonb NOT NULL DEFAULT '[]'::jsonb,
  slot_interval_minutes int NOT NULL DEFAULT 15,
  min_booking_notice_hours int NOT NULL DEFAULT 1,
  max_advance_booking_days int NOT NULL DEFAULT 60,
  buffer_minutes int NOT NULL DEFAULT 0,
  recurrence_rule jsonb,
  min_booking_minutes int,
  max_booking_minutes int,
  price_per_slot_pence int,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unified_calendars_venue_slug_unique UNIQUE (venue_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_unified_calendars_venue ON unified_calendars (venue_id) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_unified_calendars_venue_slug ON unified_calendars (venue_id, slug) WHERE slug IS NOT NULL;

-- =============================================================================
-- 4. service_items
-- =============================================================================

CREATE TABLE IF NOT EXISTS service_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  item_type text NOT NULL DEFAULT 'service',
  duration_minutes int NOT NULL,
  buffer_minutes int NOT NULL DEFAULT 0,
  processing_time_minutes int NOT NULL DEFAULT 0,
  price_pence int,
  deposit_pence int,
  price_type text NOT NULL DEFAULT 'fixed',
  capacity_per_session int,
  pre_appointment_instructions text,
  colour text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  is_bookable_online boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_service_items_venue ON service_items (venue_id) WHERE is_active = true;

-- =============================================================================
-- 5. calendar_service_assignments
-- =============================================================================

CREATE TABLE IF NOT EXISTS calendar_service_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES unified_calendars(id) ON DELETE CASCADE,
  service_item_id uuid NOT NULL REFERENCES service_items(id) ON DELETE CASCADE,
  custom_duration_minutes int,
  custom_price_pence int,
  UNIQUE (calendar_id, service_item_id)
);

CREATE INDEX IF NOT EXISTS idx_cal_service_calendar ON calendar_service_assignments (calendar_id);
CREATE INDEX IF NOT EXISTS idx_cal_service_service ON calendar_service_assignments (service_item_id);

-- =============================================================================
-- 6. calendar_blocks
-- =============================================================================

CREATE TABLE IF NOT EXISTS calendar_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES unified_calendars(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  block_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  reason text,
  block_type text NOT NULL DEFAULT 'manual',
  created_by uuid REFERENCES staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_calendar_blocks_lookup ON calendar_blocks (calendar_id, block_date);

-- =============================================================================
-- 7. event_sessions
-- =============================================================================

CREATE TABLE IF NOT EXISTS event_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  calendar_id uuid NOT NULL REFERENCES unified_calendars(id) ON DELETE CASCADE,
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  session_date date NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  capacity_override int,
  is_cancelled boolean NOT NULL DEFAULT false,
  cancel_reason text,
  service_item_id uuid REFERENCES service_items(id),
  recurrence_key text,
  source text NOT NULL DEFAULT 'manual' CHECK (source IN ('recurring', 'manual', 'import')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_event_sessions_recurrence_key
  ON event_sessions (calendar_id, recurrence_key)
  WHERE recurrence_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_event_sessions_lookup ON event_sessions (calendar_id, session_date);
CREATE INDEX IF NOT EXISTS idx_event_sessions_venue_date ON event_sessions (venue_id, session_date);

-- =============================================================================
-- 8. sms_usage + sms_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS sms_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  billing_month date NOT NULL,
  messages_sent int NOT NULL DEFAULT 0,
  messages_included int NOT NULL,
  overage_count int NOT NULL DEFAULT 0,
  overage_billed boolean NOT NULL DEFAULT false,
  overage_amount_pence int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (venue_id, billing_month)
);

CREATE INDEX IF NOT EXISTS idx_sms_usage_venue_month ON sms_usage (venue_id, billing_month);

CREATE TABLE IF NOT EXISTS sms_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id uuid REFERENCES bookings(id) ON DELETE SET NULL,
  message_type text NOT NULL,
  recipient_phone text NOT NULL,
  twilio_message_sid text,
  status text NOT NULL DEFAULT 'sent',
  segment_count int NOT NULL DEFAULT 1,
  sent_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sms_log_venue_month ON sms_log (venue_id, sent_at);

-- =============================================================================
-- 9. bookings: unified scheduling columns
-- =============================================================================

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS calendar_id uuid REFERENCES unified_calendars(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS service_item_id uuid REFERENCES service_items(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS event_session_id uuid REFERENCES event_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS final_reminder_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS post_visit_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS reschedule_notification_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS capacity_used int NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS ticket_type_id uuid;

CREATE INDEX IF NOT EXISTS idx_bookings_calendar ON bookings (calendar_id) WHERE calendar_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_service_item ON bookings (service_item_id) WHERE service_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bookings_event_session ON bookings (event_session_id) WHERE event_session_id IS NOT NULL;

-- =============================================================================
-- 10. Copy data: practitioners → unified_calendars, appointment_services → service_items
-- =============================================================================

INSERT INTO unified_calendars (
  id, venue_id, name, slug, description, photo_url, colour,
  calendar_type, capacity, parallel_clients, working_hours, break_times, days_off,
  slot_interval_minutes, buffer_minutes, sort_order, is_active, created_at
)
SELECT
  p.id,
  p.venue_id,
  p.name,
  p.slug,
  NULL::text,
  NULL::text,
  '#3B82F6',
  'practitioner',
  1,
  1,
  COALESCE(p.working_hours, '{}'::jsonb),
  COALESCE(p.break_times, '[]'::jsonb),
  COALESCE(p.days_off, '[]'::jsonb),
  15,
  0,
  p.sort_order,
  p.is_active,
  p.created_at
FROM practitioners p
ON CONFLICT (id) DO NOTHING;

INSERT INTO service_items (
  id, venue_id, name, description, item_type,
  duration_minutes, buffer_minutes, processing_time_minutes,
  price_pence, deposit_pence, price_type,
  pre_appointment_instructions, colour, sort_order, is_active, created_at
)
SELECT
  s.id,
  s.venue_id,
  s.name,
  s.description,
  'service',
  s.duration_minutes,
  COALESCE(s.buffer_minutes, 0),
  0,
  s.price_pence,
  s.deposit_pence,
  'fixed',
  NULL::text,
  s.colour,
  s.sort_order,
  s.is_active,
  s.created_at
FROM appointment_services s
ON CONFLICT (id) DO NOTHING;

INSERT INTO calendar_service_assignments (
  id, calendar_id, service_item_id, custom_duration_minutes, custom_price_pence
)
SELECT
  ps.id,
  ps.practitioner_id,
  ps.service_id,
  ps.custom_duration_minutes,
  ps.custom_price_pence
FROM practitioner_services ps
ON CONFLICT (id) DO NOTHING;

UPDATE bookings SET calendar_id = practitioner_id WHERE practitioner_id IS NOT NULL AND calendar_id IS NULL;
UPDATE bookings SET service_item_id = appointment_service_id WHERE appointment_service_id IS NOT NULL AND service_item_id IS NULL;

-- =============================================================================
-- 11. increment_sms_usage (service_role only)
-- =============================================================================

CREATE OR REPLACE FUNCTION increment_sms_usage(p_venue_id uuid, p_billing_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO sms_usage (venue_id, billing_month, messages_sent, messages_included, overage_count, overage_amount_pence)
  VALUES (
    p_venue_id,
    p_billing_month,
    1,
    COALESCE((SELECT sms_monthly_allowance FROM venues WHERE id = p_venue_id), 800),
    0,
    0
  )
  ON CONFLICT (venue_id, billing_month)
  DO UPDATE SET
    messages_sent = sms_usage.messages_sent + 1,
    overage_count = GREATEST(0, sms_usage.messages_sent + 1 - sms_usage.messages_included),
    overage_amount_pence = GREATEST(0, sms_usage.messages_sent + 1 - sms_usage.messages_included) * 5,
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION increment_sms_usage(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_sms_usage(uuid, date) TO service_role;

-- =============================================================================
-- 12. Row Level Security (staff by JWT email + service_role + public read)
-- =============================================================================

ALTER TABLE unified_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_service_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE event_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE sms_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_manage_unified_calendars"
  ON unified_calendars FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_manage_service_items"
  ON service_items FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_manage_calendar_service_assignments"
  ON calendar_service_assignments FOR ALL
  USING (calendar_id IN (
    SELECT uc.id FROM unified_calendars uc
    JOIN staff s ON s.venue_id = uc.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ))
  WITH CHECK (calendar_id IN (
    SELECT uc.id FROM unified_calendars uc
    JOIN staff s ON s.venue_id = uc.venue_id
    WHERE s.email = (auth.jwt() ->> 'email')
  ));

CREATE POLICY "staff_manage_calendar_blocks"
  ON calendar_blocks FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_manage_event_sessions"
  ON event_sessions FOR ALL
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')))
  WITH CHECK (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_select_sms_usage"
  ON sms_usage FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

CREATE POLICY "staff_select_sms_log"
  ON sms_log FOR SELECT
  USING (venue_id IN (SELECT venue_id FROM staff WHERE email = (auth.jwt() ->> 'email')));

-- Inserts to sms_usage/sms_log happen server-side via service_role (no staff JWT policy for insert)

CREATE POLICY "service_role_unified_calendars" ON unified_calendars FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_service_items" ON service_items FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_calendar_service_assignments" ON calendar_service_assignments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_calendar_blocks" ON calendar_blocks FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_event_sessions" ON event_sessions FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_sms_usage" ON sms_usage FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_sms_log" ON sms_log FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE POLICY "public_read_unified_calendars"
  ON unified_calendars FOR SELECT TO anon
  USING (is_active = true);

CREATE POLICY "public_read_service_items"
  ON service_items FOR SELECT TO anon
  USING (is_active = true AND is_bookable_online = true);

CREATE POLICY "public_read_calendar_service_assignments"
  ON calendar_service_assignments FOR SELECT TO anon
  USING (true);

CREATE POLICY "public_read_event_sessions"
  ON event_sessions FOR SELECT TO anon
  USING (is_cancelled = false);

-- Optional: enable Realtime for these tables in Supabase Dashboard → Database → Replication,
-- or run ALTER PUBLICATION supabase_realtime ADD TABLE ... if your project uses SQL for that.

-- Migrate venues that still rely on JSON availability_config but have no venue_services rows
-- into the relational model (venue_services + rules + durations + booking_restrictions).
-- Idempotent: skips venues that already have any venue_services row.

DO $$
DECLARE
  r RECORD;
  svc_id uuid;
  el jsonb;
  sort_idx int;
  cfg jsonb;
  model text;
  interval_min int;
  dur_min int;
  max_c int;
  st time;
  en time;
  lb time;
BEGIN
  FOR r IN
    SELECT v.id AS venue_id, v.availability_config AS cfg
    FROM venues v
    WHERE v.availability_config IS NOT NULL
      AND jsonb_typeof(v.availability_config) = 'object'
      AND NOT EXISTS (SELECT 1 FROM venue_services vs WHERE vs.venue_id = v.id)
  LOOP
    cfg := r.cfg;
    model := cfg->>'model';

    IF model = 'named_sittings' AND jsonb_typeof(cfg->'sittings') = 'array' THEN
      sort_idx := 0;
      FOR el IN SELECT jsonb_array_elements(cfg->'sittings')
      LOOP
        IF el->>'name' IS NULL OR el->>'start_time' IS NULL OR el->>'end_time' IS NULL THEN
          CONTINUE;
        END IF;

        st := (el->>'start_time')::time;
        en := (el->>'end_time')::time;
        lb := en - interval '30 minutes';
        IF lb < st THEN
          lb := en;
        END IF;

        INSERT INTO venue_services (
          venue_id, name, days_of_week, start_time, end_time, last_booking_time, is_active, sort_order
        ) VALUES (
          r.venue_id,
          COALESCE(NULLIF(trim(el->>'name'), ''), 'Service'),
          ARRAY[0, 1, 2, 3, 4, 5, 6]::int[],
          st,
          en,
          lb,
          true,
          sort_idx
        )
        RETURNING id INTO svc_id;

        INSERT INTO service_capacity_rules (
          service_id, max_covers_per_slot, max_bookings_per_slot, slot_interval_minutes, buffer_minutes
        ) VALUES (
          svc_id,
          GREATEST(1, COALESCE(NULLIF((el->>'max_covers'), '')::int, 30)),
          10,
          15,
          15
        );

        INSERT INTO party_size_durations (service_id, min_party_size, max_party_size, duration_minutes)
        VALUES (svc_id, 1, 50, 90);

        INSERT INTO booking_restrictions (
          service_id, min_advance_minutes, max_advance_days, min_party_size_online, max_party_size_online
        ) VALUES (svc_id, 60, 60, 1, 50);

        sort_idx := sort_idx + 1;
      END LOOP;

    ELSIF model = 'fixed_intervals' THEN
      interval_min := COALESCE(NULLIF((cfg->>'interval_minutes'), '')::int, 30);
      IF interval_min NOT IN (15, 30) THEN
        interval_min := 30;
      END IF;

      dur_min := COALESCE(NULLIF((cfg->>'sitting_duration_minutes'), '')::int, 90);
      IF dur_min < 60 THEN dur_min := 60; END IF;
      IF dur_min > 180 THEN dur_min := 180; END IF;

      max_c := 40;
      IF cfg ? 'max_covers_by_day' AND jsonb_typeof(cfg->'max_covers_by_day') = 'object' THEN
        SELECT COALESCE(MAX(
          CASE
            WHEN jsonb_typeof(t.value) = 'number' THEN (t.value)::text::numeric::int
            WHEN jsonb_typeof(t.value) = 'string' AND (t.value#>>'{}') ~ '^[0-9]+$' THEN (t.value#>>'{}')::int
            ELSE NULL
          END
        ), 40) INTO max_c
        FROM jsonb_each(cfg->'max_covers_by_day') AS t(key, value);
      END IF;

      IF max_c IS NULL OR max_c < 1 THEN
        max_c := 40;
      END IF;

      INSERT INTO venue_services (
        venue_id, name, days_of_week, start_time, end_time, last_booking_time, is_active, sort_order
      ) VALUES (
        r.venue_id,
        'Dining',
        ARRAY[0, 1, 2, 3, 4, 5, 6]::int[],
        '11:00'::time,
        '23:00'::time,
        '22:30'::time,
        true,
        0
      )
      RETURNING id INTO svc_id;

      INSERT INTO service_capacity_rules (
        service_id, max_covers_per_slot, max_bookings_per_slot, slot_interval_minutes, buffer_minutes
      ) VALUES (svc_id, max_c, 10, interval_min, 15);

      INSERT INTO party_size_durations (service_id, min_party_size, max_party_size, duration_minutes)
      VALUES (svc_id, 1, 50, dur_min);

      INSERT INTO booking_restrictions (
        service_id, min_advance_minutes, max_advance_days, min_party_size_online, max_party_size_online
      ) VALUES (svc_id, 60, 60, 1, 50);
    END IF;
  END LOOP;
END $$;

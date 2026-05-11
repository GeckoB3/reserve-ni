-- =============================================================================
-- One-off destructive cleanup for ONE venue tied to salon@norahmcnally.co.uk
--
-- Keeps ONE booking + guest identified below (`v_keep_booking_id_override` +
-- `v_keep_guest_id_confirm`), or heuristic match when booking override is NULL.
--
-- If you see "Keeper booking not found":
--   1) Run scripts/supabase-reset-salon-norahmcnally-debug-list-candidates.sql
--   2) In Supabase/local copy only set v_keep_booking_id_override and
--      v_keep_guest_id_confirm (do not commit production UUIDs).
--
-- ⚠ Run with a privileged DB role (bypasses RLS). Take a backup / confirm PITR first.
--
-- Workflow:
--   BEGIN;
--   -- paste/run this entire file in the SQL editor
--   ROLLBACK;   -- dry-run
--   -- then COMMIT when satisfied
-- =============================================================================

DO $$

DECLARE
  v_staff_email        constant text := 'salon@norahmcnally.co.uk';
  v_keep_email         constant text := 'pollystrain@gmail.com';

  -- Phone compared on digits-only (handles "+" / whitespace variants stored in rows).
  v_phone_digits       constant text := regexp_replace('+447549918202', '\D', '', 'g');

  v_booking_local_date constant date := '2026-08-31'::date;
  v_booking_hour       constant int  := 15;
  v_booking_minute     constant int  := 30;

  -- Set BOTH when you already know IDs (recommended in SQL Editor — do not paste real customer UUIDs into Git).
  v_keep_booking_id_override uuid := NULL;
  v_keep_guest_id_confirm   uuid := NULL;

  v_venue_id                  uuid;
  v_keep_guest                uuid;
  v_keep_booking              uuid;
  v_staff_email_venue_count   int;

BEGIN
  SELECT COUNT(DISTINCT s.venue_id)::int
  INTO v_staff_email_venue_count
  FROM staff s
  WHERE lower(trim(s.email)) = lower(trim(v_staff_email));

  IF v_staff_email_venue_count > 1 THEN
    RAISE EXCEPTION
      'Multiple venues share login email %. Open this script and set v_venue_id manually after querying staff.',
      v_staff_email;

  ELSIF v_staff_email_venue_count = 1 THEN
    SELECT s.venue_id INTO v_venue_id
    FROM staff s
    WHERE lower(trim(s.email)) = lower(trim(v_staff_email))
    LIMIT 1;

  ELSE
    SELECT v.id INTO v_venue_id
    FROM venues v
    WHERE lower(trim(coalesce(v.email, ''))) = lower(trim(v_staff_email))
    LIMIT 1;
  END IF;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'Venue not found for account email %. Check staff.email or venues.email.', v_staff_email;
  END IF;

  ----------------------------------------------------------------------
  -- Keeper row: explicit UUID overrides everything else (safest recovery path)
  ----------------------------------------------------------------------
  IF v_keep_booking_id_override IS NOT NULL THEN
    BEGIN
      SELECT b.id, b.guest_id
      INTO STRICT v_keep_booking, v_keep_guest
      FROM bookings b
      WHERE b.venue_id = v_venue_id AND b.id = v_keep_booking_id_override;
    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE EXCEPTION
          'v_keep_booking_id_override booking % does not belong to resolved venue %. Run debug-list-candidates.sql.',
          v_keep_booking_id_override,
          v_venue_id;
    END;

    IF v_keep_guest_id_confirm IS NOT NULL AND v_keep_guest IS DISTINCT FROM v_keep_guest_id_confirm THEN
      RAISE EXCEPTION
        'Safety check failed: booking % has guest_id % but expected confirm guest_id %. Aborting purge.',
        v_keep_booking,
        v_keep_guest,
        v_keep_guest_id_confirm;
    END IF;
  ELSE
    ----------------------------------------------------------------------
    -- Heuristic match (covers variant on service_variant, unified service_item / legacy appointment_service)
    ----------------------------------------------------------------------
    BEGIN
      SELECT b.id, b.guest_id
      INTO STRICT v_keep_booking, v_keep_guest
      FROM bookings b
      INNER JOIN guests g ON g.id = b.guest_id AND g.venue_id = v_venue_id
      LEFT JOIN unified_calendars uc ON uc.id = b.calendar_id
      LEFT JOIN practitioners pr ON pr.id = b.practitioner_id AND pr.venue_id = v_venue_id
      LEFT JOIN service_variants sv ON sv.id = b.service_variant_id
      LEFT JOIN service_items si ON si.id = b.service_item_id AND si.venue_id = v_venue_id
      LEFT JOIN appointment_services ast ON ast.id = b.appointment_service_id AND ast.venue_id = v_venue_id
      WHERE b.venue_id = v_venue_id
        AND lower(trim(coalesce(b.guest_email, g.email, ''))) = lower(trim(v_keep_email))
        AND regexp_replace(coalesce(b.guest_phone, g.phone, ''), '\D', '', 'g') = v_phone_digits
        AND trim(coalesce(b.guest_first_name, g.first_name, '')) ILIKE '%ryan%'
        AND trim(coalesce(b.guest_last_name, g.last_name, '')) ILIKE '%strain%'
        AND b.booking_date = v_booking_local_date
        AND EXTRACT(HOUR FROM b.booking_time)::int = v_booking_hour
        AND EXTRACT(MINUTE FROM b.booking_time)::int = v_booking_minute
        /** "Student / 16–18" may live on variant, unified service_items, or legacy appointment_services **/
        AND (
          (
            b.service_variant_id IS NOT NULL
            AND concat_ws(' ', coalesce(sv.name, '')) ILIKE '%student%'
            AND (
              concat_ws(' ', sv.name, si.name, ast.name) ~* '(16[^\d]?18|18[^\d]?16)'
            )
          )
          OR (
            b.service_variant_id IS NULL
            AND concat_ws(' ', si.name, ast.name, coalesce(b.special_requests, ''), '') ILIKE '%student%'
            AND concat_ws(' ', si.name, ast.name, coalesce(b.special_requests, '')) ~* '(16[^\d]?18|18[^\d]?16)'
          )
        )
        /** Stylist calendar name, practitioner, or manual notes mentioning Norah **/
        AND (
          COALESCE(uc.name, '') ILIKE '%norah%'
          OR COALESCE(pr.name, '') ILIKE '%norah%'
          OR COALESCE(b.internal_notes, '') ILIKE '%norah%'
          OR COALESCE(b.special_requests, '') ILIKE '%norah%'
        );

    EXCEPTION
      WHEN NO_DATA_FOUND THEN
        RAISE EXCEPTION
          'Keeper booking not found. Run scripts/supabase-reset-salon-norahmcnally-debug-list-candidates.sql, paste booking_id into v_keep_booking_id_override, relax time/date, or widen the keeper WHERE.';
      WHEN TOO_MANY_ROWS THEN
        RAISE EXCEPTION 'Multiple keeper bookings matched — use v_keep_booking_id_override to pick one.';
    END;
  END IF;

  RAISE NOTICE 'Venue % | keep guest % | keep booking %', v_venue_id, v_keep_guest, v_keep_booking;

  UPDATE venue_tables vt
  SET temporary_booking_id = NULL
  WHERE vt.venue_id = v_venue_id
    AND vt.temporary_booking_id IS NOT NULL
    AND vt.temporary_booking_id <> v_keep_booking;

  DELETE FROM events e
  WHERE e.booking_id IN (
      SELECT id FROM bookings b
      WHERE b.venue_id = v_venue_id AND b.id <> v_keep_booking
    );

  IF EXISTS (
      SELECT 1 FROM pg_trigger
      WHERE tgname = 'trg_log_table_assignment'
        AND tgrelid = 'public.booking_table_assignments'::regclass
    )
  THEN
    ALTER TABLE booking_table_assignments DISABLE TRIGGER trg_log_table_assignment;
    DELETE FROM booking_table_assignments
    WHERE booking_id IN (
        SELECT id FROM bookings b
        WHERE b.venue_id = v_venue_id AND b.id <> v_keep_booking
      );
    ALTER TABLE booking_table_assignments ENABLE TRIGGER trg_log_table_assignment;
  ELSE
    DELETE FROM booking_table_assignments
    WHERE booking_id IN (
        SELECT id FROM bookings b
        WHERE b.venue_id = v_venue_id AND b.id <> v_keep_booking
      );
  END IF;

  IF to_regclass('public.sms_log') IS NOT NULL THEN
    DELETE FROM sms_log
    WHERE venue_id = v_venue_id
      AND booking_id IS NOT NULL
      AND booking_id <> v_keep_booking;
  END IF;

  IF to_regclass('public.communications') IS NOT NULL THEN
    DELETE FROM communications
    WHERE venue_id = v_venue_id
      AND booking_id IS DISTINCT FROM v_keep_booking;
  END IF;

  IF to_regclass('public.communication_logs') IS NOT NULL THEN
    DELETE FROM communication_logs
    WHERE venue_id = v_venue_id
      AND booking_id IS DISTINCT FROM v_keep_booking;
  END IF;

  UPDATE import_booking_rows
  SET guest_id = NULL
  WHERE venue_id = v_venue_id
    AND guest_id IS NOT NULL
    AND guest_id <> v_keep_guest;

  IF to_regclass('public.waitlist_entries') IS NOT NULL THEN
    DELETE FROM waitlist_entries WHERE venue_id = v_venue_id;
  END IF;

  IF to_regclass('public.contact_audit_events') IS NOT NULL THEN
    DELETE FROM contact_audit_events
    WHERE venue_id = v_venue_id
      AND guest_id IS DISTINCT FROM v_keep_guest;
  END IF;

  IF to_regclass('public.guest_merge_events') IS NOT NULL THEN
    DELETE FROM guest_merge_events WHERE venue_id = v_venue_id;
  END IF;

  DELETE FROM bookings b
  WHERE b.venue_id = v_venue_id AND b.id <> v_keep_booking;

  DELETE FROM guests g
  WHERE g.venue_id = v_venue_id AND g.id <> v_keep_guest;

  IF to_regclass('public.class_booking_groups') IS NOT NULL THEN
    DELETE FROM class_booking_groups cbg
    WHERE cbg.venue_id = v_venue_id
      AND NOT EXISTS (SELECT 1 FROM bookings bx WHERE bx.group_booking_id = cbg.id);
  END IF;

  DELETE FROM guest_households h
  WHERE h.venue_id = v_venue_id
    AND NOT EXISTS (
      SELECT 1 FROM guest_household_members m WHERE m.household_id = h.id
    );

  IF EXISTS (
      SELECT 1
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'refresh_guest_booking_aggregates'
    )
  THEN
    PERFORM public.refresh_guest_booking_aggregates(v_keep_guest);
  END IF;

  RAISE NOTICE 'Venue purge complete.';
END $$;

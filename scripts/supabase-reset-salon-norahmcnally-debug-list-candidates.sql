-- =============================================================================
-- Read-only probe: lists bookings near the keeper criteria for salon@norahmcnally.co.uk
-- Run BEFORE the purge script when "Keeper booking not found" fires.
--
-- Compare columns to your real row; then either:
--   A) Paste `booking_id` into `v_keep_booking_id_override` in the main script, or
--   B) Edit predicates in that script until exactly one candidate remains.
-- =============================================================================

WITH resolved_venue AS (
  SELECT
    CASE
      WHEN (SELECT COUNT(DISTINCT s.venue_id) FROM staff s WHERE lower(trim(s.email)) = lower(trim('salon@norahmcnally.co.uk'))) > 1
        THEN NULL::uuid
      WHEN (SELECT COUNT(DISTINCT s.venue_id) FROM staff s WHERE lower(trim(s.email)) = lower(trim('salon@norahmcnally.co.uk'))) = 1
        THEN (SELECT s.venue_id FROM staff s WHERE lower(trim(s.email)) = lower(trim('salon@norahmcnally.co.uk')) LIMIT 1)
      ELSE (
        SELECT v.id FROM venues v
        WHERE lower(trim(coalesce(v.email, ''))) = lower(trim('salon@norahmcnally.co.uk'))
        LIMIT 1
      )
    END AS venue_id
)
SELECT
  b.id                                         AS booking_id,
  g.id                                         AS guest_id,
  b.booking_date,
  b.booking_time::text                         AS booking_time,
  lower(trim(coalesce(b.guest_email, g.email, ''))) AS merged_email_norm,
  regexp_replace(coalesce(b.guest_phone, g.phone, ''), '\D', '', 'g') AS merged_phone_digits,
  b.guest_first_name,
  b.guest_last_name,
  g.first_name                                  AS guest_row_first_name,
  g.last_name                                   AS guest_row_last_name,
  sv.id                                         AS service_variant_id,
  sv.name                                       AS service_variant_name,
  si.name                                       AS service_item_name,
  ast.name                                      AS appointment_service_name,
  uc.name                                       AS unified_calendar_name,
  pr.name                                       AS practitioner_name,
  b.special_requests,
  substring(coalesce(b.internal_notes, ''), 1, 120) AS internal_notes_preview
FROM resolved_venue rv
JOIN bookings b ON b.venue_id = rv.venue_id
JOIN guests g ON g.id = b.guest_id AND g.venue_id = rv.venue_id
LEFT JOIN service_variants sv ON sv.id = b.service_variant_id
LEFT JOIN service_items si ON si.id = b.service_item_id AND si.venue_id = b.venue_id
LEFT JOIN appointment_services ast ON ast.id = b.appointment_service_id AND ast.venue_id = b.venue_id
LEFT JOIN unified_calendars uc ON uc.id = b.calendar_id
LEFT JOIN practitioners pr ON pr.id = b.practitioner_id AND pr.venue_id = b.venue_id
WHERE rv.venue_id IS NOT NULL
  AND (
    b.booking_date = '2026-08-31'::date
    OR lower(trim(coalesce(b.guest_email, g.email, ''))) = lower(trim('pollystrain@gmail.com'))
    OR regexp_replace(coalesce(b.guest_phone, g.phone, ''), '\D', '', 'g')
        = regexp_replace('+447549918202', '\D', '', 'g')
  )
ORDER BY b.booking_date, b.booking_time;

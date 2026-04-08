-- Appointments venues now store their enabled booking models as a first-class set.
-- Restaurants continue to expose table reservations first, but can still list extra models.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS active_booking_models jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN venues.active_booking_models IS
  'JSON array of booking_model values exposed by the venue. Appointments-plan venues use this as the source of truth instead of a primary booking_model plus enabled_models.';

UPDATE venues AS v
SET active_booking_models = CASE
  WHEN v.pricing_tier = 'appointments' THEN (
    SELECT to_jsonb(COALESCE(array_agg(model ORDER BY sort_order), ARRAY[]::text[]))
    FROM (
      SELECT DISTINCT candidate.model, candidate.sort_order
      FROM (
        SELECT
          CASE
            WHEN v.booking_model::text IN ('practitioner_appointment', 'unified_scheduling') THEN 'unified_scheduling'
            WHEN v.booking_model::text = 'class_session' THEN 'class_session'
            WHEN v.booking_model::text = 'event_ticket' THEN 'event_ticket'
            WHEN v.booking_model::text = 'resource_booking' THEN 'resource_booking'
            ELSE NULL
          END AS model,
          CASE
            WHEN v.booking_model::text IN ('practitioner_appointment', 'unified_scheduling') THEN 1
            WHEN v.booking_model::text = 'class_session' THEN 2
            WHEN v.booking_model::text = 'event_ticket' THEN 3
            WHEN v.booking_model::text = 'resource_booking' THEN 4
            ELSE NULL
          END AS sort_order
        UNION ALL
        SELECT
          CASE
            WHEN elem.value IN ('practitioner_appointment', 'unified_scheduling') THEN 'unified_scheduling'
            WHEN elem.value = 'class_session' THEN 'class_session'
            WHEN elem.value = 'event_ticket' THEN 'event_ticket'
            WHEN elem.value = 'resource_booking' THEN 'resource_booking'
            ELSE NULL
          END AS model,
          CASE
            WHEN elem.value IN ('practitioner_appointment', 'unified_scheduling') THEN 1
            WHEN elem.value = 'class_session' THEN 2
            WHEN elem.value = 'event_ticket' THEN 3
            WHEN elem.value = 'resource_booking' THEN 4
            ELSE NULL
          END AS sort_order
        FROM jsonb_array_elements_text(COALESCE(v.enabled_models, '[]'::jsonb)) AS elem(value)
      ) AS candidate
      WHERE candidate.model IS NOT NULL
    ) AS ordered_models
  )
  ELSE (
    SELECT to_jsonb(COALESCE(array_agg(model ORDER BY sort_order), ARRAY[]::text[]))
    FROM (
      SELECT DISTINCT candidate.model, candidate.sort_order
      FROM (
        SELECT
          CASE
            WHEN v.booking_model::text IN ('practitioner_appointment', 'unified_scheduling') THEN 'unified_scheduling'
            ELSE v.booking_model::text
          END AS model,
          CASE
            WHEN v.booking_model::text = 'table_reservation' THEN 1
            WHEN v.booking_model::text IN ('practitioner_appointment', 'unified_scheduling') THEN 2
            WHEN v.booking_model::text = 'class_session' THEN 3
            WHEN v.booking_model::text = 'event_ticket' THEN 4
            WHEN v.booking_model::text = 'resource_booking' THEN 5
            ELSE 99
          END AS sort_order
        UNION ALL
        SELECT
          CASE
            WHEN elem.value IN ('practitioner_appointment', 'unified_scheduling') THEN 'unified_scheduling'
            ELSE elem.value
          END AS model,
          CASE
            WHEN elem.value = 'table_reservation' THEN 1
            WHEN elem.value IN ('practitioner_appointment', 'unified_scheduling') THEN 2
            WHEN elem.value = 'class_session' THEN 3
            WHEN elem.value = 'event_ticket' THEN 4
            WHEN elem.value = 'resource_booking' THEN 5
            ELSE 99
          END AS sort_order
        FROM jsonb_array_elements_text(COALESCE(v.enabled_models, '[]'::jsonb)) AS elem(value)
      ) AS candidate
      WHERE candidate.model IS NOT NULL
    ) AS ordered_models
  )
END;

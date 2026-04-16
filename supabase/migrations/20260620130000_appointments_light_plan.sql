-- Appointments Light plan: venue lifecycle + per-venue SMS overage rate on sms_usage

ALTER TABLE venues ADD COLUMN IF NOT EXISTS light_plan_free_period_ends_at TIMESTAMPTZ;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS light_plan_converted_at TIMESTAMPTZ;

COMMENT ON COLUMN venues.light_plan_free_period_ends_at IS 'Appointments Light: free period end (typically signup + 3 months). NULL for other tiers.';
COMMENT ON COLUMN venues.light_plan_converted_at IS 'Appointments Light: when paid £5/month period started after free window. NULL if still in free period or not Light.';

COMMENT ON COLUMN venues.pricing_tier IS 'appointments | light | restaurant | founding';

ALTER TABLE sms_usage ADD COLUMN IF NOT EXISTS overage_rate_pence INT NOT NULL DEFAULT 6;

UPDATE sms_usage su
SET overage_rate_pence = CASE
  WHEN LOWER(TRIM(COALESCE(v.pricing_tier, ''))) = 'light' THEN 8
  ELSE 6
END
FROM venues v
WHERE su.venue_id = v.id;

CREATE OR REPLACE FUNCTION increment_sms_usage(p_venue_id uuid, p_billing_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_allow int;
  v_rate int;
  v_tier text;
  v_new_sent int;
  v_overage int;
BEGIN
  SELECT
    LOWER(TRIM(COALESCE(pricing_tier, ''))),
    COALESCE(sms_monthly_allowance,
      CASE
        WHEN LOWER(TRIM(COALESCE(pricing_tier, ''))) IN ('restaurant', 'founding') THEN 800
        WHEN LOWER(TRIM(COALESCE(pricing_tier, ''))) = 'light' THEN 0
        ELSE 300
      END
    )
  INTO v_tier, v_allow
  FROM venues
  WHERE id = p_venue_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_rate := CASE WHEN v_tier = 'light' THEN 8 ELSE 6 END;

  v_new_sent := 1;
  v_overage := GREATEST(0, v_new_sent - v_allow);

  INSERT INTO sms_usage (
    venue_id,
    billing_month,
    messages_sent,
    messages_included,
    overage_count,
    overage_amount_pence,
    overage_rate_pence
  )
  VALUES (
    p_venue_id,
    p_billing_month,
    v_new_sent,
    v_allow,
    v_overage,
    v_overage * v_rate,
    v_rate
  )
  ON CONFLICT (venue_id, billing_month)
  DO UPDATE SET
    messages_included = (
      SELECT COALESCE(v2.sms_monthly_allowance,
        CASE
          WHEN LOWER(TRIM(COALESCE(v2.pricing_tier, ''))) IN ('restaurant', 'founding') THEN 800
          WHEN LOWER(TRIM(COALESCE(v2.pricing_tier, ''))) = 'light' THEN 0
          ELSE 300
        END
      )
      FROM venues v2 WHERE v2.id = p_venue_id
    ),
    overage_rate_pence = (
      SELECT CASE WHEN LOWER(TRIM(COALESCE(v2.pricing_tier, ''))) = 'light' THEN 8 ELSE 6 END
      FROM venues v2 WHERE v2.id = p_venue_id
    ),
    messages_sent = sms_usage.messages_sent + 1,
    overage_count = GREATEST(
      0,
      sms_usage.messages_sent + 1 - (
        SELECT COALESCE(v2.sms_monthly_allowance,
          CASE
            WHEN LOWER(TRIM(COALESCE(v2.pricing_tier, ''))) IN ('restaurant', 'founding') THEN 800
            WHEN LOWER(TRIM(COALESCE(v2.pricing_tier, ''))) = 'light' THEN 0
            ELSE 300
          END
        )
        FROM venues v2 WHERE v2.id = p_venue_id
      )
    ),
    overage_amount_pence = GREATEST(
      0,
      sms_usage.messages_sent + 1 - (
        SELECT COALESCE(v2.sms_monthly_allowance,
          CASE
            WHEN LOWER(TRIM(COALESCE(v2.pricing_tier, ''))) IN ('restaurant', 'founding') THEN 800
            WHEN LOWER(TRIM(COALESCE(v2.pricing_tier, ''))) = 'light' THEN 0
            ELSE 300
          END
        )
        FROM venues v2 WHERE v2.id = p_venue_id
      )
    ) * (
      SELECT CASE WHEN LOWER(TRIM(COALESCE(v2.pricing_tier, ''))) = 'light' THEN 8 ELSE 6 END
      FROM venues v2 WHERE v2.id = p_venue_id
    ),
    updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION increment_sms_usage(uuid, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_sms_usage(uuid, date) TO service_role;

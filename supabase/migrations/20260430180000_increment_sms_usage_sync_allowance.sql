-- Keep sms_usage.messages_included aligned with venues.sms_monthly_allowance on every increment
-- (Standard: 200 × calendar_count; Business/Founding: 800 — see §1.1 implementation plan).

CREATE OR REPLACE FUNCTION increment_sms_usage(p_venue_id uuid, p_billing_month date)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_included int;
BEGIN
  SELECT COALESCE(sms_monthly_allowance, 800) INTO v_included
  FROM venues
  WHERE id = p_venue_id;

  IF v_included IS NULL THEN
    v_included := 800;
  END IF;

  INSERT INTO sms_usage (venue_id, billing_month, messages_sent, messages_included, overage_count, overage_amount_pence)
  VALUES (
    p_venue_id,
    p_billing_month,
    1,
    v_included,
    0,
    0
  )
  ON CONFLICT (venue_id, billing_month)
  DO UPDATE SET
    messages_included = (SELECT COALESCE(v.sms_monthly_allowance, 800) FROM venues v WHERE v.id = p_venue_id),
    messages_sent = sms_usage.messages_sent + 1,
    overage_count = GREATEST(
      0,
      sms_usage.messages_sent + 1 - (SELECT COALESCE(v.sms_monthly_allowance, 800) FROM venues v WHERE v.id = p_venue_id)
    ),
    overage_amount_pence = GREATEST(
      0,
      sms_usage.messages_sent + 1 - (SELECT COALESCE(v.sms_monthly_allowance, 800) FROM venues v WHERE v.id = p_venue_id)
    ) * 5,
    updated_at = now();
END;
$$;

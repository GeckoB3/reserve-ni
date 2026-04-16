-- Track 3-day post–free-period follow-up email for Light venues (avoid duplicate sends).

ALTER TABLE venues ADD COLUMN IF NOT EXISTS light_plan_grace_followup_sent_at TIMESTAMPTZ;

COMMENT ON COLUMN venues.light_plan_grace_followup_sent_at IS 'Appointments Light: when the 3-day grace reminder email was sent after free period ended without payment.';

-- Reserve NI: superuser support sign-in-as sessions and append-only audit log.
-- Service role is used from Next.js; RLS enabled with no policies blocks anon/authenticated direct access.

CREATE TABLE support_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  superuser_id uuid NOT NULL,
  superuser_email text NOT NULL,
  superuser_display_name text,
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  apparent_staff_id uuid NOT NULL REFERENCES staff (id) ON DELETE CASCADE,
  reason text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  ended_at timestamptz
);

CREATE INDEX idx_support_sessions_superuser ON support_sessions (superuser_id);
CREATE INDEX idx_support_sessions_venue ON support_sessions (venue_id);
CREATE INDEX idx_support_sessions_expires ON support_sessions (expires_at);
CREATE INDEX idx_support_sessions_active ON support_sessions (superuser_id, ended_at)
  WHERE ended_at IS NULL;

CREATE TABLE support_audit_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  support_session_id uuid REFERENCES support_sessions (id) ON DELETE SET NULL,
  venue_id uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  apparent_staff_id uuid REFERENCES staff (id) ON DELETE SET NULL,
  superuser_id uuid NOT NULL,
  superuser_email text,
  event_type text NOT NULL,
  http_method text,
  http_path text,
  summary text NOT NULL,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_support_audit_venue_created ON support_audit_events (venue_id, created_at DESC);
CREATE INDEX idx_support_audit_superuser_created ON support_audit_events (superuser_id, created_at DESC);
CREATE INDEX idx_support_audit_session ON support_audit_events (support_session_id, created_at DESC);

ALTER TABLE support_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_audit_events ENABLE ROW LEVEL SECURITY;

-- Append-only audit: no UPDATE or DELETE
CREATE OR REPLACE FUNCTION support_audit_events_deny_update_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' OR TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'support_audit_events is append-only: % not allowed', TG_OP;
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER support_audit_events_append_only
  BEFORE UPDATE OR DELETE ON support_audit_events
  FOR EACH ROW
  EXECUTE PROCEDURE support_audit_events_deny_update_delete();

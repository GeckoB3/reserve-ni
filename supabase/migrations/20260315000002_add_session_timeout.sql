-- Add session timeout setting to venues table
-- null = stay logged in until manual logout (default)
-- positive integer = auto-logout after N minutes of inactivity
ALTER TABLE venues ADD COLUMN IF NOT EXISTS session_timeout_minutes integer DEFAULT NULL;

-- Async validation job tracking + polling support for data import tool.

ALTER TABLE import_sessions
  ADD COLUMN IF NOT EXISTS validation_job_id uuid,
  ADD COLUMN IF NOT EXISTS validation_job_status text,
  ADD COLUMN IF NOT EXISTS validation_job_error text;

COMMENT ON COLUMN import_sessions.validation_job_id IS 'Id returned to client when validation is queued; poll until validation_job_status is complete.';
COMMENT ON COLUMN import_sessions.validation_job_status IS 'queued | running | complete | failed';
COMMENT ON COLUMN import_sessions.validation_job_error IS 'Set when validation_job_status = failed';

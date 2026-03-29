-- Model B: Per-practitioner service overrides with admin-controlled staff edit permissions.

ALTER TABLE appointment_services
  ADD COLUMN IF NOT EXISTS staff_may_customize_name boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_description boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_duration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_buffer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_price boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_deposit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_colour boolean NOT NULL DEFAULT false;

ALTER TABLE practitioner_services
  ADD COLUMN IF NOT EXISTS custom_name text,
  ADD COLUMN IF NOT EXISTS custom_description text,
  ADD COLUMN IF NOT EXISTS custom_buffer_minutes int,
  ADD COLUMN IF NOT EXISTS custom_deposit_pence int,
  ADD COLUMN IF NOT EXISTS custom_colour text;

COMMENT ON COLUMN appointment_services.staff_may_customize_price IS 'When true, linked staff may set custom_price_pence for their calendar only.';
COMMENT ON COLUMN practitioner_services.custom_name IS 'Optional per-practitioner display name; falls back to appointment_services.name.';

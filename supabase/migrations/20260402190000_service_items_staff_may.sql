-- Align service_items with appointment_services staff-customization flags (unified scheduling).

ALTER TABLE service_items
  ADD COLUMN IF NOT EXISTS staff_may_customize_name boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_description boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_duration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_buffer boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_price boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_deposit boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS staff_may_customize_colour boolean NOT NULL DEFAULT false;

-- Make the confirm-or-cancel reminder timing configurable (default 56 hours before booking)
ALTER TABLE communication_settings
  ADD COLUMN IF NOT EXISTS reminder_hours_before INTEGER NOT NULL DEFAULT 56;

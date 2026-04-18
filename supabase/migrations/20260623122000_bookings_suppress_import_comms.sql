ALTER TABLE bookings ADD COLUMN IF NOT EXISTS suppress_import_comms boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN bookings.suppress_import_comms IS 'When true, automated comms (confirmation/reminders) should not be sent for this booking (e.g. data import).';

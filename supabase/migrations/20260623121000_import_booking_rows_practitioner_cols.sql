-- Optional FK targets for practitioner-appointment imports (Step 3b denormalized onto rows)
ALTER TABLE import_booking_rows ADD COLUMN IF NOT EXISTS resolved_practitioner_id uuid REFERENCES practitioners(id);
ALTER TABLE import_booking_rows ADD COLUMN IF NOT EXISTS resolved_appointment_service_id uuid REFERENCES appointment_services(id);

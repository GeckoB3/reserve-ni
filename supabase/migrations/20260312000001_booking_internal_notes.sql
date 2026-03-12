-- Reserve NI: separate staff-only notes from guest special requests.
ALTER TABLE bookings
ADD COLUMN IF NOT EXISTS internal_notes text;


-- Booking import staging: raw deposit columns from CSV (mapped on Map step).

ALTER TABLE import_booking_rows ADD COLUMN IF NOT EXISTS raw_deposit_amount text;
ALTER TABLE import_booking_rows ADD COLUMN IF NOT EXISTS raw_deposit_paid text;
ALTER TABLE import_booking_rows ADD COLUMN IF NOT EXISTS raw_deposit_status text;

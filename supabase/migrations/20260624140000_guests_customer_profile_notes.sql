-- Staff-editable notes about a guest that apply across all bookings for that guest at the venue.

ALTER TABLE guests ADD COLUMN IF NOT EXISTS customer_profile_notes text;

COMMENT ON COLUMN guests.customer_profile_notes IS
  'Venue staff notes about this customer; shown on every booking for this guest. Not visible to the guest.';

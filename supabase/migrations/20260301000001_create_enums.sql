-- Reserve NI: custom enums for venues, staff, and bookings

CREATE TYPE staff_role AS ENUM ('admin', 'staff');

CREATE TYPE booking_status AS ENUM (
  'Pending',
  'Confirmed',
  'Cancelled',
  'No-Show',
  'Completed',
  'Seated'
);

CREATE TYPE booking_source AS ENUM ('online', 'phone', 'walk-in');

CREATE TYPE deposit_status AS ENUM (
  'Not Required',
  'Pending',
  'Paid',
  'Refunded',
  'Forfeited'
);

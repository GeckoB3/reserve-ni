-- Reserve NI — Database schema reference
-- Apply via Supabase migrations in supabase/migrations/ (in order).

-- =============================================================================
-- ENUMS
-- =============================================================================

-- CREATE TYPE staff_role AS ENUM ('admin', 'staff');
-- CREATE TYPE booking_status AS ENUM ('Pending','Confirmed','Cancelled','No-Show','Completed','Seated');
-- CREATE TYPE booking_source AS ENUM ('online', 'phone', 'walk-in');
-- CREATE TYPE deposit_status AS ENUM ('Not Required','Pending','Paid','Refunded','Forfeited');

-- =============================================================================
-- TABLES
-- =============================================================================

-- venues — core venue profile
-- id (uuid PK), name, slug (unique), address, phone, email, cover_photo_url,
-- opening_hours (jsonb), booking_rules (jsonb), deposit_config (jsonb),
-- availability_config (jsonb), timezone (default 'Europe/London'), created_at, updated_at

-- staff — venue staff, linked to Supabase Auth by email
-- id (uuid PK), venue_id (FK → venues), email, name, role (staff_role), created_at

-- guests — one per guest per venue; unique (venue_id, email); index (venue_id, phone)
-- id (uuid PK), venue_id (FK), name, email, phone (E.164), global_guest_hash, visit_count, created_at, updated_at

-- bookings
-- id (uuid PK), venue_id (FK), guest_id (FK), booking_date, booking_time, party_size,
-- status (booking_status), source (booking_source), dietary_notes, occasion, special_requests,
-- deposit_amount_pence, deposit_status, stripe_payment_intent_id, cancellation_deadline, created_at, updated_at

-- events — immutable append-only audit log; no UPDATE/DELETE
-- id (uuid PK), venue_id (FK), booking_id (FK nullable), event_type (text), payload (jsonb), created_at

-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================
-- Staff identified by auth.jwt() ->> 'email'. Staff can only read/write rows
-- where venue_id IN (SELECT venue_id FROM staff WHERE email = current_user_email).

-- =============================================================================
-- TRIGGERS
-- =============================================================================
-- events_append_only: BEFORE UPDATE/DELETE on events → raise exception.
-- booking_events_trigger: AFTER INSERT OR UPDATE on bookings → insert into events
--   (booking_created on INSERT; booking_status_changed when status changes).

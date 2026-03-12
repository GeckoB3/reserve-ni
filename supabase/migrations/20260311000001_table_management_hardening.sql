-- Reserve NI: table management hardening
-- Adds missing integrity checks and cross-table consistency guards.

ALTER TABLE venue_tables
  ADD CONSTRAINT venue_tables_covers_check
  CHECK (min_covers >= 1 AND max_covers >= min_covers);

ALTER TABLE table_combinations
  ADD CONSTRAINT table_combinations_covers_check
  CHECK (combined_min_covers >= 1 AND combined_max_covers >= combined_min_covers);

ALTER TABLE table_statuses
  ADD CONSTRAINT table_statuses_status_check
  CHECK (status IN ('available', 'reserved', 'seated', 'starters', 'mains', 'dessert', 'bill', 'paid', 'bussing'));

CREATE OR REPLACE FUNCTION fn_validate_table_combination_member_venue()
RETURNS TRIGGER AS $$
DECLARE
  combo_venue uuid;
  table_venue uuid;
BEGIN
  SELECT venue_id INTO combo_venue FROM table_combinations WHERE id = NEW.combination_id;
  SELECT venue_id INTO table_venue FROM venue_tables WHERE id = NEW.table_id;

  IF combo_venue IS NULL OR table_venue IS NULL OR combo_venue <> table_venue THEN
    RAISE EXCEPTION 'Table combination member venue mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_table_combination_member_venue ON table_combination_members;
CREATE TRIGGER trg_validate_table_combination_member_venue
  BEFORE INSERT OR UPDATE ON table_combination_members
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_table_combination_member_venue();

CREATE OR REPLACE FUNCTION fn_validate_booking_table_assignment_venue()
RETURNS TRIGGER AS $$
DECLARE
  booking_venue uuid;
  table_venue uuid;
BEGIN
  SELECT venue_id INTO booking_venue FROM bookings WHERE id = NEW.booking_id;
  SELECT venue_id INTO table_venue FROM venue_tables WHERE id = NEW.table_id;

  IF booking_venue IS NULL OR table_venue IS NULL OR booking_venue <> table_venue THEN
    RAISE EXCEPTION 'Booking/table assignment venue mismatch';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_booking_table_assignment_venue ON booking_table_assignments;
CREATE TRIGGER trg_validate_booking_table_assignment_venue
  BEFORE INSERT OR UPDATE ON booking_table_assignments
  FOR EACH ROW
  EXECUTE FUNCTION fn_validate_booking_table_assignment_venue();

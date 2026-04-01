-- Align legacy Model B rows with new default: unified_scheduling (same behaviour as practitioner_appointment in app).
-- Safe to run after 20260430120000_unified_scheduling_engine.sql (enum value exists).

UPDATE venues
SET booking_model = 'unified_scheduling'
WHERE booking_model = 'practitioner_appointment';

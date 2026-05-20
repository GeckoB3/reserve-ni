-- Appointment waitlist mode: staff alerts when availability opens (staff_choose mode).

CREATE TABLE IF NOT EXISTS public.waitlist_slot_opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id uuid NOT NULL REFERENCES public.venues (id) ON DELETE CASCADE,
  slot_date date NOT NULL,
  slot_time time NOT NULL,
  practitioner_id uuid,
  calendar_id uuid,
  appointment_service_id uuid REFERENCES public.appointment_services (id) ON DELETE SET NULL,
  service_item_id uuid REFERENCES public.service_items (id) ON DELETE SET NULL,
  source_booking_id uuid REFERENCES public.bookings (id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  dismissed_at timestamptz,
  filled_at timestamptz,
  CONSTRAINT waitlist_slot_opportunities_status_check
    CHECK (status IN ('open', 'filled', 'dismissed'))
);

CREATE INDEX IF NOT EXISTS idx_waitlist_slot_opportunities_venue_open
  ON public.waitlist_slot_opportunities (venue_id, slot_date, status)
  WHERE status = 'open';

COMMENT ON TABLE public.waitlist_slot_opportunities IS
  'Staff-facing alerts when appointment availability opens and waitlist mode is staff_choose.';

-- Track which slot an offered waitlist entry relates to (notify_in_order cascade).

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS offered_slot_time time;

ALTER TABLE public.waitlist_entries
  ADD COLUMN IF NOT EXISTS offered_calendar_id uuid;

CREATE INDEX IF NOT EXISTS idx_waitlist_entries_offered_expires
  ON public.waitlist_entries (venue_id, status, expires_at)
  WHERE waitlist_kind = 'appointment' AND status = 'offered';

COMMENT ON COLUMN public.waitlist_entries.offered_slot_time IS
  'Actual appointment slot time that opened (for notify_in_order cascade).';

COMMENT ON COLUMN public.waitlist_entries.offered_calendar_id IS
  'Calendar/practitioner the opened slot was on (for notify_in_order cascade).';

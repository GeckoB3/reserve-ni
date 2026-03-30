-- Guest marketing opt-out (PECR / preferences). Transactional comms still allowed via sendCommunication classification.

ALTER TABLE guests
  ADD COLUMN IF NOT EXISTS marketing_opt_out boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN guests.marketing_opt_out IS 'When true, skip non-transactional guest communications (e.g. post-visit, digest).';

-- =============================================================================
-- Combined Booking Pages & Unified Service Catalogue (plan §4; spec §21)
-- -----------------------------------------------------------------------------
-- Extends the venue_collectives Phase 2 feature with a host-curated, merged,
-- price/duration-overridable catalogue that can be served either at the
-- dedicated /book/c/{slug} or by adopting a member's existing /book/{slug}.
--
-- Sovereignty guarantee (plan D5): every override lives only in these
-- collective-scoped tables. Nothing here ever mutates a venue's own
-- appointment_services / practitioners / prices, so breaking a link splits the
-- catalogue cleanly — the rows below simply stop being applied.
--
-- See Docs/reserveni-combined-booking-page-plan.md.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. venue_collectives — page mode, slug strategy, timezone
-- -----------------------------------------------------------------------------

ALTER TABLE venue_collectives
  ADD COLUMN IF NOT EXISTS page_mode text NOT NULL DEFAULT 'directory';
ALTER TABLE venue_collectives
  ADD COLUMN IF NOT EXISTS slug_strategy text NOT NULL DEFAULT 'dedicated';
ALTER TABLE venue_collectives
  ADD COLUMN IF NOT EXISTS adopted_venue_id uuid REFERENCES venues (id) ON DELETE SET NULL;
ALTER TABLE venue_collectives
  ADD COLUMN IF NOT EXISTS timezone text;

COMMENT ON COLUMN venue_collectives.page_mode IS
  'directory = list-of-venues page (Phase 2); unified_catalog = host-curated merged catalogue (combined booking page).';
COMMENT ON COLUMN venue_collectives.slug_strategy IS
  'dedicated = served only at /book/c/{slug}; adopt_member = also served at the adopted member venue''s /book/{slug}.';

ALTER TABLE venue_collectives DROP CONSTRAINT IF EXISTS venue_collectives_page_mode_valid;
ALTER TABLE venue_collectives
  ADD CONSTRAINT venue_collectives_page_mode_valid
  CHECK (page_mode IN ('directory', 'unified_catalog'));

ALTER TABLE venue_collectives DROP CONSTRAINT IF EXISTS venue_collectives_slug_strategy_valid;
ALTER TABLE venue_collectives
  ADD CONSTRAINT venue_collectives_slug_strategy_valid
  CHECK (slug_strategy IN ('dedicated', 'adopt_member'));

ALTER TABLE venue_collectives DROP CONSTRAINT IF EXISTS venue_collectives_adopt_requires_venue;
ALTER TABLE venue_collectives
  ADD CONSTRAINT venue_collectives_adopt_requires_venue
  CHECK (slug_strategy = 'dedicated' OR adopted_venue_id IS NOT NULL);

-- A given venue's booking slug can be adopted by at most one active collective.
CREATE UNIQUE INDEX IF NOT EXISTS venue_collectives_adopted_venue_unique
  ON venue_collectives (adopted_venue_id)
  WHERE adopted_venue_id IS NOT NULL AND status = 'active';

-- -----------------------------------------------------------------------------
-- 2. venue_collective_members — solo page behaviour (plan D2)
-- -----------------------------------------------------------------------------

ALTER TABLE venue_collective_members
  ADD COLUMN IF NOT EXISTS solo_page_behavior text NOT NULL DEFAULT 'keep_live';

COMMENT ON COLUMN venue_collective_members.solo_page_behavior IS
  'keep_live = the member''s own /book/{slug} stays directly bookable; redirect = it 308-redirects to the combined page.';

ALTER TABLE venue_collective_members DROP CONSTRAINT IF EXISTS venue_collective_members_solo_page_valid;
ALTER TABLE venue_collective_members
  ADD CONSTRAINT venue_collective_members_solo_page_valid
  CHECK (solo_page_behavior IN ('keep_live', 'redirect'));

-- -----------------------------------------------------------------------------
-- 3. collective_service_items — the merged offering (host-curated, plan §4.3)
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS collective_service_items (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  collective_id             uuid NOT NULL REFERENCES venue_collectives (id) ON DELETE CASCADE,
  name                      text NOT NULL,
  description               text,
  category                  text,
  display_order             integer NOT NULL DEFAULT 0,
  default_duration_minutes  integer,
  default_price_pence       integer,
  pricing_display           text NOT NULL DEFAULT 'from',
  allow_any_available       boolean NOT NULL DEFAULT true,
  status                    text NOT NULL DEFAULT 'active',
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collective_service_items_status_valid
    CHECK (status IN ('active', 'archived')),
  CONSTRAINT collective_service_items_pricing_display_valid
    CHECK (pricing_display IN ('from', 'fixed', 'per_provider')),
  CONSTRAINT collective_service_items_duration_nonneg
    CHECK (default_duration_minutes IS NULL OR default_duration_minutes >= 0),
  CONSTRAINT collective_service_items_price_nonneg
    CHECK (default_price_pence IS NULL OR default_price_pence >= 0)
);

CREATE INDEX IF NOT EXISTS collective_service_items_collective
  ON collective_service_items (collective_id, status);

-- -----------------------------------------------------------------------------
-- 4. collective_service_providers — which calendars provide an item (plan §4.4)
--    + per-provider price/duration overrides + member consent state machine.
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS collective_service_providers (
  id                         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id                    uuid NOT NULL REFERENCES collective_service_items (id) ON DELETE CASCADE,
  member_id                  uuid NOT NULL REFERENCES venue_collective_members (id) ON DELETE CASCADE,
  venue_id                   uuid NOT NULL REFERENCES venues (id) ON DELETE CASCADE,
  -- The venue's own appointment_services.id (the real bookable service). No FK:
  -- a deleted source service is handled gracefully at render (provider hidden).
  source_service_id          uuid NOT NULL,
  -- NULL = all of this venue's practitioners that offer source_service_id.
  practitioner_id            uuid,
  price_pence_override       integer,
  duration_minutes_override  integer,
  -- plan D6: the owning member must approve the commercial terms for its calendars.
  approval_status            text NOT NULL DEFAULT 'pending',
  approved_by_user_id        uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  -- plan §8: link/eligibility-driven bookability (never touches approval_status).
  status                     text NOT NULL DEFAULT 'active',
  created_at                 timestamptz NOT NULL DEFAULT now(),
  updated_at                 timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT collective_service_providers_approval_valid
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  CONSTRAINT collective_service_providers_status_valid
    CHECK (status IN ('active', 'suspended', 'removed')),
  CONSTRAINT collective_service_providers_price_nonneg
    CHECK (price_pence_override IS NULL OR price_pence_override >= 0),
  CONSTRAINT collective_service_providers_duration_pos
    CHECK (duration_minutes_override IS NULL OR duration_minutes_override > 0)
);

-- One provider row per (item, calendar). practitioner_id NULL ("all") and a
-- specific practitioner are distinct addressing modes, so guard each separately.
CREATE UNIQUE INDEX IF NOT EXISTS collective_service_providers_unique_specific
  ON collective_service_providers (item_id, venue_id, source_service_id, practitioner_id)
  WHERE practitioner_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS collective_service_providers_unique_all
  ON collective_service_providers (item_id, venue_id, source_service_id)
  WHERE practitioner_id IS NULL;
CREATE INDEX IF NOT EXISTS collective_service_providers_item
  ON collective_service_providers (item_id, status, approval_status);
CREATE INDEX IF NOT EXISTS collective_service_providers_venue
  ON collective_service_providers (venue_id, status);

-- updated_at triggers (reuse the account_links trigger fn from the Phase 1 migration).
DROP TRIGGER IF EXISTS collective_service_items_updated_at ON collective_service_items;
CREATE TRIGGER collective_service_items_updated_at
  BEFORE UPDATE ON collective_service_items
  FOR EACH ROW
  EXECUTE PROCEDURE account_links_set_updated_at();

DROP TRIGGER IF EXISTS collective_service_providers_updated_at ON collective_service_providers;
CREATE TRIGGER collective_service_providers_updated_at
  BEFORE UPDATE ON collective_service_providers
  FOR EACH ROW
  EXECUTE PROCEDURE account_links_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. bookings — combined-page offering attribution (plan §4.5)
-- -----------------------------------------------------------------------------

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS collective_service_item_id uuid;

COMMENT ON COLUMN bookings.collective_service_item_id IS
  'Set when a booking was produced by a combined-page offering. Attribution only (no FK), mirrors collective_id.';

-- -----------------------------------------------------------------------------
-- 6. Row-Level Security
-- -----------------------------------------------------------------------------

ALTER TABLE collective_service_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE collective_service_providers ENABLE ROW LEVEL SECURITY;

-- Staff of the host or any member venue may read the catalogue.
DROP POLICY IF EXISTS "staff_select_collective_service_items" ON collective_service_items;
CREATE POLICY "staff_select_collective_service_items"
  ON collective_service_items FOR SELECT
  USING (
    collective_id IN (
      SELECT id FROM venue_collectives
      WHERE host_venue_id IN (SELECT current_staff_venue_ids())
    )
    OR collective_id IN (
      SELECT collective_id FROM venue_collective_members
      WHERE venue_id IN (SELECT current_staff_venue_ids())
    )
  );

-- Public: active items of an active unified_catalog collective.
DROP POLICY IF EXISTS "public_read_active_collective_service_items" ON collective_service_items;
CREATE POLICY "public_read_active_collective_service_items"
  ON collective_service_items FOR SELECT TO anon
  USING (
    status = 'active'
    AND collective_id IN (
      SELECT id FROM venue_collectives
      WHERE status = 'active' AND page_mode = 'unified_catalog'
    )
  );

DROP POLICY IF EXISTS "service_role_collective_service_items" ON collective_service_items;
CREATE POLICY "service_role_collective_service_items"
  ON collective_service_items FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Staff read: a venue's own provider rows, plus the host can read all of its
-- collective's providers (to curate the catalogue).
DROP POLICY IF EXISTS "staff_select_collective_service_providers" ON collective_service_providers;
CREATE POLICY "staff_select_collective_service_providers"
  ON collective_service_providers FOR SELECT
  USING (
    venue_id IN (SELECT current_staff_venue_ids())
    OR item_id IN (
      SELECT i.id FROM collective_service_items i
      JOIN venue_collectives c ON c.id = i.collective_id
      WHERE c.host_venue_id IN (SELECT current_staff_venue_ids())
    )
  );

-- Public: only bookable providers (approved + active) of active items of active
-- unified_catalog collectives. (The app renders the public page via the admin
-- client; this anon policy is defence-in-depth for any direct PostgREST read.)
DROP POLICY IF EXISTS "public_read_bookable_collective_service_providers" ON collective_service_providers;
CREATE POLICY "public_read_bookable_collective_service_providers"
  ON collective_service_providers FOR SELECT TO anon
  USING (
    status = 'active'
    AND approval_status = 'approved'
    AND item_id IN (
      SELECT i.id FROM collective_service_items i
      JOIN venue_collectives c ON c.id = i.collective_id
      WHERE i.status = 'active' AND c.status = 'active' AND c.page_mode = 'unified_catalog'
    )
  );

DROP POLICY IF EXISTS "service_role_collective_service_providers" ON collective_service_providers;
CREATE POLICY "service_role_collective_service_providers"
  ON collective_service_providers FOR ALL TO service_role USING (true) WITH CHECK (true);

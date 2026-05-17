# ReserveNI: Linked Accounts Feature Specification

**Status:** Draft for review — rewritten against the live ReserveNI schema and codebase
**Plan scope:** Appointments-family venues only (`light`, `plus`, `appointments` pricing tiers)
**Settings location:** `/dashboard/settings` → new **Linked Accounts** tab (`?tab=linked-accounts`)
**Last updated:** 2026-05-17

---

## 0. Terminology mapping — read this first

The earlier draft of this document was written against a generic data model. ReserveNI's
actual schema uses different names, and this rewrite is bound to the real tables. Whenever this
spec says "account" it means a ReserveNI **venue** (`public.venues` row). The mapping is:

| This spec / UI term | ReserveNI schema reality |
|---|---|
| **Account** | A `public.venues` row. One venue = one ReserveNI subscription = one "account". |
| **Linked account** | Another `venues` row connected via an `account_links` row. |
| **Calendar** | A bookable calendar entity. For Appointments venues this is a `public.practitioners` row. (Class types, events, and resources are the calendar entity for other booking models.) |
| **Client** | A `public.guests` row — the venue-scoped customer record. `UNIQUE (venue_id, email)`. |
| **Booking** | A `public.bookings` row, keyed by `venue_id`, `guest_id`, and (for appointments) `practitioner_id` + `appointment_service_id`. |
| **Service** | A `public.appointment_services` row. |
| **Admin user** | A `public.staff` row with `role = 'admin'` and `revoked_at IS NULL`. |
| **Audit log** | New `account_link_audit_log` table (the existing append-only `public.events` table remains the per-venue booking audit log and is reused — see §10). |

There is **no `accounts` table, no `account_id` column, no `calendar_id` column, and no
`current_account_id()` function** in ReserveNI. Bookings carry `venue_id`, not `account_id`.
Times are stored as `booking_date date` + `booking_time time` + `booking_end_time time`, not
`start_time`/`end_time` timestamps. RLS identifies the caller via
`auth.jwt() ->> 'email'` and/or `staff.user_id = auth.uid()`. Every SQL fragment in this
document uses the real column names.

---

## 1. Purpose and use cases

The Linked Accounts feature lets two or more independent ReserveNI venues share calendar
visibility, booking access, and (Phase 2) a combined public booking page, while keeping all
client and booking data fully separate at rest in each venue.

Primary use cases:

- A salon owner who rents chairs to independent stylists, where each stylist runs their own
  ReserveNI venue and `guests` list but they want to coordinate scheduling and present a
  unified booking experience to walk-in customers.
- Co-located independent practitioners (physiotherapists, chiropractors, beauty therapists)
  who want to see each other's availability to manage shared rooms or refer overflow clients.
- Multi-practitioner clinics where each clinician runs their own books on a separate venue
  but the building/brand is shared.

The feature is built on one rule: **each venue remains the sovereign owner of its own data.
Linking is a relationship, not a merge.**

---

## 2. Core principles

These principles govern every design decision. Any future change must preserve all of them.

1. **Data separation is absolute.** `bookings`, `guests`, `practitioners`, `appointment_services`,
   `class_types`, `experience_events`, `venue_resources` and all related rows are stored only
   under their owning `venue_id`. A linked venue gains *visibility* and optionally *action
   rights*, never *ownership*. No row is ever copied between venues.
2. **Consent is required and revocable.** Any venue can refuse a link request, and either
   venue can break an existing link unilaterally at any time.
3. **Plan source governs availability.** A shared calendar exists only while the owning venue
   has an eligible, active subscription (`plan_status = 'active'`, eligible `pricing_tier`).
   Visibility is always contingent, never persistent.
4. **No data persists after unlinking.** Once a link ends, RLS denies all cross-venue reads
   and writes immediately. Because nothing was ever copied, severance is automatic — each
   venue simply keeps the rows it always owned.
5. **Every cross-venue action is auditable.** Both venues can see a complete record of what
   the other did in their data (`account_link_audit_log`, plus the owning venue's own
   `events` log).
6. **Permissions are explicit and granular.** Defaults are sensible but every dimension is
   independently controllable, per direction.

---

## 3. Eligibility and scope

- Available to **Appointments-family venues only** — venues whose `pricing_tier` is one of
  `light`, `plus`, or `appointments`. The practical discriminator in code is
  `venues.booking_model <> 'table_reservation'` (use the existing
  `isRestaurantTableProductTier()` helper in `src/lib/tier-enforcement.ts` to detect the
  restaurant case).
- **Restaurant (table-reservation) venues cannot create or receive link requests.** The
  Linked Accounts tab does not render for them, mirroring how `SettingsView.tsx` already
  gates restaurant-only sections.
- A venue with `plan_status` other than `'active'` (e.g. `'past_due'`, `'cancelled'`) cannot
  create new links. Existing links remain visible in settings but are **suspended** (see §9).
- No hard cap on the number of links a venue may hold. A soft UI warning above ~10 links is
  acceptable but not enforced.
- No minimum subscription age. A Light-plan venue still inside its 3-month free period
  (`light_plan_free_period_ends_at` in the future, `plan_status = 'active'`) is fully
  eligible.

### 3.1 User-level authorisation within a venue

Link management is restricted to **Admin staff** — `staff` rows with `role = 'admin'` and
`revoked_at IS NULL`. Specifically:

- The Linked Accounts tab is only rendered when the current user is an Admin (`SettingsView`
  already receives an `isAdmin` flag and uses it to hide the `staff` and `data-import` tabs;
  `linked-accounts` follows the same pattern in `resolveInitialTab()`).
- Only Admin users can create, send, accept, reject, modify, or break links, and (Phase 2)
  manage venue collectives.
- Non-Admin `staff` on a venue inherit the visibility and action permissions the link grants
  (a read-only linked calendar appears read-only to all staff), but cannot manage links.

**Note on the Light plan.** A `light`-tier venue has exactly **one** staff login, which is
the owner/Admin. So on Light the Admin-only rule is satisfied trivially. `plus` venues allow
up to 5 staff and `appointments` venues unlimited; both already support the
`staff_role` enum `('admin','staff')`, so no new role system is required — this feature
reuses the existing `staff` table as-is.

---

## 4. Data model

Two new tables for Phase 1 (`account_links`, `account_link_audit_log`) and two more for
Phase 2 (`venue_collectives`, `venue_collective_members`). All follow ReserveNI conventions:
`uuid` PKs via `gen_random_uuid()`, `timestamptz` columns, snake_case, RLS enabled, created
through a dated migration in `supabase/migrations/`.

### 4.1 `account_links` — pairwise relationship between two venues

Each row is a single link between exactly two venues. Permissions are defined independently
in each direction. To keep the unique constraint simple, the two venues are stored as an
ordered pair: `venue_low_id` always holds the smaller UUID, `venue_high_id` the larger.
`requested_by_venue_id` records who initiated.

```
account_links
├── id                      uuid PK default gen_random_uuid()
├── venue_low_id            uuid NOT NULL FK → venues(id) ON DELETE CASCADE
├── venue_high_id           uuid NOT NULL FK → venues(id) ON DELETE CASCADE
├── requested_by_venue_id   uuid NOT NULL FK → venues(id)   -- venue_low or venue_high
├── status                  link_status NOT NULL default 'pending'
│       enum link_status: 'pending' | 'accepted' | 'rejected'
│                        | 'revoked' | 'expired' | 'suspended'
│
│   -- Permissions GRANTED BY venue_low TO venue_high (what high may do to low's data)
├── low_grants_calendar     link_calendar_visibility NOT NULL default 'full_details'
├── low_grants_pii          boolean NOT NULL default true
├── low_grants_act          link_action_level NOT NULL default 'edit_existing'
│
│   -- Permissions GRANTED BY venue_high TO venue_low
├── high_grants_calendar    link_calendar_visibility NOT NULL default 'full_details'
├── high_grants_pii         boolean NOT NULL default true
├── high_grants_act         link_action_level NOT NULL default 'edit_existing'
│
├── request_message         text                       -- optional personal note
├── created_by_user_id      uuid FK → auth.users(id)
├── responded_by_user_id    uuid FK → auth.users(id)    nullable
├── created_at              timestamptz NOT NULL default now()
├── responded_at            timestamptz                nullable
├── terminated_at           timestamptz                nullable
├── termination_reason      link_termination_reason    nullable
│       enum: 'unlinked' | 'subscription_lapsed' | 'venue_deleted'
│            | 'plan_ineligible' | 'request_expired'
├── updated_at              timestamptz NOT NULL default now()
│
└── enums:
    link_calendar_visibility: 'none' | 'time_only' | 'full_details'
    link_action_level:        'none' | 'edit_existing' | 'create_edit_cancel'
```

**Constraints and indexes:**

- `CHECK (venue_low_id < venue_high_id)` — enforce ordering.
- `CHECK (requested_by_venue_id IN (venue_low_id, venue_high_id))`.
- Partial unique index preventing a duplicate live link:
  `CREATE UNIQUE INDEX account_links_active_pair ON account_links (venue_low_id, venue_high_id)
   WHERE status IN ('pending','accepted','suspended');`
  Once a link is `rejected`, `revoked`, or `expired`, a fresh request can be created.
- CHECK constraints encoding the permission-coherence rules in §5.5 (e.g. `time_only` forces
  `pii = false` and `act = 'none'`; `pii = false` forces `act = 'none'`). Apply to both
  `low_grants_*` and `high_grants_*` triples.
- Indexes on `(venue_low_id, status)` and `(venue_high_id, status)` for settings/RLS lookups.

**Notes:**

- `pii` is only meaningful when `calendar = 'full_details'`; with `time_only` PII is hidden
  regardless. `act` is only meaningful when `calendar = 'full_details'` AND `pii = true`.
- Pending requests expire after 30 days. A daily cron (`/api/cron/account-link-maintenance`,
  registered in `vercel.json` alongside the existing `light-plan-expiry` cron and secured
  with `CRON_SECRET`) transitions them to `expired` and notifies both venues.

### 4.2 `account_link_audit_log` — cross-venue action record

Every action one venue takes on another venue's data via a link writes a row here. Visible
to **both** venues, and retained after the link ends.

The existing append-only `public.events` table already records `booking_created` /
`booking_status_changed` per venue via `booking_events_trigger`; those rows continue to be
written into the **owning** venue's `events` log automatically. `account_link_audit_log` is
the *additional* cross-venue record: it captures the acting venue, the acting user, and
read-events (which `events` does not track), and it is the surface both venues query from the
Linked Accounts tab.

```
account_link_audit_log
├── id                  uuid PK default gen_random_uuid()
├── link_id             uuid NOT NULL FK → account_links(id) ON DELETE CASCADE
├── acting_venue_id     uuid NOT NULL FK → venues(id)   -- who performed the action
├── acting_user_id      uuid FK → auth.users(id)        -- which staff user
├── owning_venue_id     uuid NOT NULL FK → venues(id)   -- whose data was affected
├── action_type         text NOT NULL
│       'viewed_calendar' | 'viewed_booking' | 'created_booking'
│     | 'edited_booking'  | 'cancelled_booking'
├── resource_type       text                 -- 'booking' | 'guest' | 'practitioner' | 'service'
├── resource_id         uuid                 nullable
├── before_state        jsonb                nullable  -- for edits / cancels
├── after_state         jsonb                nullable  -- for creates / edits
├── created_at          timestamptz NOT NULL default now()
└── indexes: (owning_venue_id, created_at DESC), (acting_venue_id, created_at DESC),
             (link_id, created_at DESC)
```

**Notes:**

- `viewed_calendar` / `viewed_booking` rows are debounced: dedupe by
  `(acting_user_id, resource_id)` within a 5-minute window so a calendar render does not spam
  the log.
- Write actions (`created_booking`, `edited_booking`, `cancelled_booking`) are inserted
  inside the **same transaction** as the mutation, by a database trigger on `bookings`, not
  by application code — this mirrors how the existing `booking_events_trigger` already writes
  `events` rows and prevents any code path from skipping the audit.
- The log is **never deleted**. It survives link termination and survives either venue
  cancelling its ReserveNI subscription — it is each venue's own record of access to its own
  data. (`ON DELETE CASCADE` on `link_id` is acceptable only because `account_links` rows are
  themselves never hard-deleted; if that ever changes, switch to `ON DELETE SET NULL` plus a
  denormalised link descriptor.)

### 4.3 `venue_collectives` and `venue_collective_members` — Phase 2

A *venue collective* is a combined public booking page joining two or more linked venues
under shared branding. "Collective" is used deliberately instead of "venue group" because in
ReserveNI each account already **is** a venue — a group of venues needs a distinct word.

Collectives are independent of pairwise links: a venue can be linked without joining any
collective, but joining a collective requires accepted pairwise links with full mutual
visibility (`full_details` in both directions) between every pair of members.

```
venue_collectives
├── id                       uuid PK default gen_random_uuid()
├── slug                     text NOT NULL UNIQUE   -- /book/c/{slug} (see §7.2.1)
├── name                     text NOT NULL
├── host_venue_id            uuid NOT NULL FK → venues(id)  -- controls branding + slug
├── branding                 jsonb NOT NULL default '{}'  -- logo_url, primary_colour, description
├── service_grouping         text NOT NULL default 'by_practitioner'
│       'by_practitioner' | 'by_service_type'
├── allow_any_practitioner   boolean NOT NULL default false
├── status                   text NOT NULL default 'active'   -- 'active' | 'dissolved'
├── created_at, updated_at   timestamptz NOT NULL default now()

venue_collective_members
├── id                       uuid PK default gen_random_uuid()
├── collective_id            uuid NOT NULL FK → venue_collectives(id) ON DELETE CASCADE
├── venue_id                 uuid NOT NULL FK → venues(id) ON DELETE CASCADE
├── status                   text NOT NULL default 'invited'
│       'invited' | 'active' | 'left' | 'removed'
├── display_order            integer NOT NULL default 0
├── visible_practitioner_ids uuid[] NOT NULL default '{}'  -- practitioners exposed on the page
├── visible_service_ids      uuid[] NOT NULL default '{}'  -- appointment_services exposed
├── allow_any_practitioner_substitution boolean NOT NULL default false
├── joined_at, left_at       timestamptz nullable
└── partial UNIQUE (collective_id, venue_id) WHERE status IN ('invited','active')
```

**Constraints:**

- A collective needs ≥ 2 `active` members to render a public page.
- Adding a member requires accepted pairwise `account_links` with `full_details` in **both**
  directions between the new venue and every existing member. Enforced at insert time and
  re-verified on every public page render (the link could have been broken since).
- The host venue cannot leave without transferring host status or dissolving the collective.
- The collective auto-dissolves when `active` membership drops below 2 (see §7.5).

### 4.4 RLS — cross-venue data access

**Critical:** these policies are the single source of truth for cross-venue access. They must
be written and tested before any UI code. They extend — never replace — the existing
venue-scoped staff policies (e.g. `staff_manage_bookings`, `staff_manage_guests` in
`20260301000007_rls_policies.sql`).

ReserveNI has no `current_account_id()`. A staff user may work at multiple venues, so "the
current venue" is not a single value — it is the set of venues where the caller is active
staff. Cross-venue access is therefore expressed through `SECURITY DEFINER` helper functions
that, for a given *owning* venue, report what the current user is permitted to do via any
link to a venue they staff.

```sql
-- The set of venue ids the current caller is active staff at.
CREATE OR REPLACE FUNCTION public.current_staff_venue_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT venue_id FROM public.staff
  WHERE revoked_at IS NULL
    AND (email = (auth.jwt() ->> 'email')
         OR (user_id IS NOT NULL AND user_id = auth.uid()));
$$;

-- Best calendar visibility the caller has into p_owner_venue via any accepted link.
-- Returns 'none' | 'time_only' | 'full_details'.
CREATE OR REPLACE FUNCTION public.link_calendar_grant(p_owner_venue uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
    (SELECT g.v FROM (
       SELECT CASE
         WHEN al.venue_low_id = p_owner_venue THEN al.low_grants_calendar::text
         ELSE al.high_grants_calendar::text
       END AS v
       FROM public.account_links al
       WHERE al.status = 'accepted'
         AND (
           (al.venue_low_id  = p_owner_venue AND al.venue_high_id IN (SELECT current_staff_venue_ids()))
           OR
           (al.venue_high_id = p_owner_venue AND al.venue_low_id  IN (SELECT current_staff_venue_ids()))
         )
     ) g
     -- pick the strongest: full_details > time_only > none
     ORDER BY CASE g.v WHEN 'full_details' THEN 2 WHEN 'time_only' THEN 1 ELSE 0 END DESC
     LIMIT 1),
    'none');
$$;
```

Analogous helpers: `link_pii_grant(p_owner_venue uuid) RETURNS boolean` and
`link_action_grant(p_owner_venue uuid) RETURNS text`. Each evaluates the direction
*owner → caller* (i.e. what the owner venue has granted to the venue the caller staffs).

**Bookings — SELECT.** A booking row in venue X is visible if the caller staffs X, or has at
least `time_only` calendar visibility into X via a link:

```sql
CREATE POLICY "linked_venue_can_view_bookings" ON public.bookings
FOR SELECT USING (
  venue_id IN (SELECT current_staff_venue_ids())
  OR public.link_calendar_grant(venue_id) IN ('time_only', 'full_details')
);
```

**Bookings — UPDATE.** Editing another venue's booking requires `act` of `edit_existing` or
higher:

```sql
CREATE POLICY "linked_venue_can_edit_bookings" ON public.bookings
FOR UPDATE USING (
  venue_id IN (SELECT current_staff_venue_ids())
  OR public.link_action_grant(venue_id) IN ('edit_existing', 'create_edit_cancel')
)
WITH CHECK (
  venue_id IN (SELECT current_staff_venue_ids())
  OR public.link_action_grant(venue_id) IN ('edit_existing', 'create_edit_cancel')
);
```

**Bookings — INSERT / DELETE.** Same shape, but require `act = 'create_edit_cancel'`
specifically. (Cancellation in ReserveNI is normally a status change to `'Cancelled'`, i.e. an
UPDATE — but creating a brand-new booking in a linked venue, or hard-deleting, needs the full
level.)

**Guests — SELECT.** A linked venue can read another venue's `guests` rows only with
`full_details` + PII granted:

```sql
CREATE POLICY "linked_venue_can_view_guests" ON public.guests
FOR SELECT USING (
  venue_id IN (SELECT current_staff_venue_ids())
  OR (public.link_calendar_grant(venue_id) = 'full_details'
      AND public.link_pii_grant(venue_id) = true)
);
```

The customer-safe `guests_account_safe` view (used by `/account`) is unaffected — it filters
on `user_id = auth.uid()` and is unrelated to linking.

**Other booking-model tables.** `practitioners`, `appointment_services`,
`practitioner_services`, `class_types`, `class_instances`, `experience_events`,
`venue_resources` already have public read policies for active rows (anon can read active
practitioners/services/etc.). Linked-venue staff therefore already see enough to *render* a
calendar. Add linked-venue SELECT policies only where a table has no public read policy and
the linked view needs it (e.g. inactive practitioners or buffer/break configuration). Do not
broaden write access on these — a linked venue never edits another venue's practitioners or
service menu; the `act` permission covers `bookings` only.

**Field-level redaction for `time_only`.** RLS cannot cleanly hide individual columns. When
the caller's grant is `time_only`, the application must query through an anonymised view
rather than the base table:

```sql
CREATE OR REPLACE VIEW public.bookings_linked_anonymised
WITH (security_barrier = true) AS
SELECT
  b.id, b.venue_id, b.practitioner_id,
  b.booking_date, b.booking_time, b.booking_end_time,
  b.status,
  NULL::uuid AS guest_id,
  NULL::uuid AS appointment_service_id,
  NULL::text AS dietary_notes,
  NULL::text AS occasion,
  NULL::text AS special_requests
FROM public.bookings b;
```

The application layer chooses the source per owning venue: own venue and `full_details`
links read `public.bookings`; `time_only` links read `bookings_linked_anonymised`. A helper
`get_linked_booking_source(p_owner_venue uuid)` returns the correct relation name. The
anonymised view inherits the base table's RLS, so a `time_only` viewer still passes the
SELECT policy above but sees only time blocks (`booking_date`, `booking_time`,
`booking_end_time`, `status`, `practitioner_id`) with everything else nulled.

**Mutation safety.** Every cross-venue mutation must:

1. Pass the RLS policy above.
2. Generate an `account_link_audit_log` row in the **same transaction**, written by a trigger
   on `bookings` (`AFTER INSERT OR UPDATE`), not by application code — this mirrors how the
   existing `booking_events_trigger` already writes `events` rows and prevents any code path
   from skipping the audit.
3. Record the acting venue and `link_id`. Because `bookings` has no `link_id` column, add
   nullable columns `created_by_linked_venue_id uuid` and `last_modified_by_linked_venue_id
   uuid` to `bookings` (both FK → `venues`, `ON DELETE SET NULL`). When a cross-venue actor
   creates or edits a booking, the application sets these so the audit trigger can resolve
   the authorising link. They are `NULL` for ordinary same-venue bookings.

Note: `bookings.created_by_staff_id` references the **owning** venue's `staff`. A cross-venue
actor has no `staff` row in the owning venue, so `created_by_staff_id` must be left `NULL`
for cross-venue creates (it is already nullable); attribution lives in
`created_by_linked_venue_id` + the audit log instead.

---

## 5. Permission model

Three orthogonal dimensions, set independently per direction on the link.

### 5.1 Calendar visibility (`link_calendar_visibility`)

| Value | Meaning |
|---|---|
| `none` | Cannot see any of the other venue's calendar/booking data. |
| `time_only` | Sees time blocks (busy/free with duration) per practitioner. No guest name, no service, no notes. Served via `bookings_linked_anonymised`. |
| `full_details` | Sees full booking detail: time, practitioner, service, status. |

### 5.2 Client PII visibility (`low_grants_pii` / `high_grants_pii`)

| Value | Meaning |
|---|---|
| `false` | Even with `full_details`, `guests` rows (name, email, phone, notes) stay hidden. |
| `true` | Full `guests` information visible. Only meaningful with `full_details`. |

### 5.3 Action permissions (`link_action_level`)

| Value | Meaning |
|---|---|
| `none` | Read-only. |
| `edit_existing` | Can UPDATE existing `bookings` (reschedule, change service/practitioner, edit notes, set status). Cannot INSERT new bookings. |
| `create_edit_cancel` | Full booking management: INSERT new bookings, UPDATE, and cancel (status → `Cancelled`) in the linked venue. |

A linked venue never edits the other venue's `practitioners`, `appointment_services`,
working hours, or settings — `act` scopes to `bookings` only.

### 5.4 Default preset

A new link request is pre-filled, mutually, with:

- Calendar visibility: `full_details`
- Client PII: `true`
- Action: `edit_existing`

This errs toward useful access while keeping create/cancel rights deliberate (accidentally
cancelling another venue's booking is high-impact). The requester may adjust any dimension
before sending; the recipient may adjust again on acceptance (§6.2).

### 5.5 Constraint rules (enforced in UI **and** as DB CHECK constraints)

- A link cannot grant `none` in **both** directions — that is a no-op. One-way links (e.g.
  A sees B but B does not see A) are valid; zero-way links are rejected at submission.
- `calendar = 'time_only'` forces `pii = false` and `act = 'none'`.
- `pii = false` forces `act = 'none'`.
- `calendar = 'none'` forces `pii = false` and `act = 'none'` for that direction.

---

## 6. Link lifecycle

### 6.1 Request creation

1. An Admin on Venue A opens `/dashboard/settings?tab=linked-accounts` → "Send link request".
2. They identify Venue B. **Resolved decision (§12):** identify by Venue B's public
   booking-page **slug** (`venues.slug`, already unique and already the public identifier
   used in `/book/[venue-slug]`). The form does a live lookup against an Admin-only endpoint
   that returns only the venue's display `name` for confirmation — never PII. Email is *not*
   used as the identifier (it couples the link to one person and venues already have a
   stable public slug).
3. They configure permissions for both directions (defaults per §5.4).
4. They optionally add a `request_message`.
5. Submit.

System actions on submit (server route, e.g. `POST /api/venue/account-links`):

- Validate both venues are Appointments-family and `plan_status = 'active'`.
- Insert an `account_links` row, `status = 'pending'`, ordering the two venue ids into
  `venue_low_id`/`venue_high_id`, setting `requested_by_venue_id`.
- Send an email (SendGrid, authenticated domain) to Venue B's contact email (`venues.email`)
  and to every active Admin on Venue B.
- Surface a dashboard banner to Admins on Venue B (§8.3).

### 6.2 Request acceptance

When an Admin on Venue B loads any dashboard page, a persistent banner shows:

> 🔗 **{Venue A name} wants to link with you.** [Review request] [Dismiss for 24h]

"Review request" opens a modal showing Venue A's name, the `request_message`, and a plain
summary of permissions per direction:

> **{Venue A} will be able to:** see your calendar in full, see your client details, edit
> existing bookings.
> **You will be able to:** see {Venue A}'s calendar in full, see their client details, edit
> existing bookings.

Buttons: **Accept**, **Accept with changes**, **Reject**.

- **Accept** — applies the requested permissions verbatim; `status → 'accepted'`,
  `responded_at`, `responded_by_user_id` set.
- **Accept with changes** — reopens the permission editor; on submit the modified grants are
  saved and `status → 'accepted'`. Venue A is emailed/notified with a diff of what changed.
- **Reject** — `status → 'rejected'`. Venue A receives a brief notification; no reason
  collected.

### 6.3 Request expiry

Pending requests expire 30 days after `created_at`. The daily
`/api/cron/account-link-maintenance` job sets `status = 'expired'`,
`termination_reason = 'request_expired'`, and notifies both venues.

### 6.4 Active link

An accepted link appears in both venues' Linked Accounts tab with: the other venue's name,
the permissions in each direction (framed as "you can…" / "they can…"), the date linked, a
"View audit log" action, and buttons **Edit permissions** and **Unlink**.

### 6.5 Permission changes mid-link

Either venue can propose a permission change; it behaves like a new request — the other venue
sees a banner and must accept, with the current grants shown for comparison. Until accepted,
the existing grants stay in force.

**Exception — unilateral reduction.** A venue may *reduce* the permissions it grants at any
time with no consent from the other party (e.g. immediately revoke PII access). It may never
unilaterally *increase* what the other venue can do. The Linked Accounts tab exposes this as
a direct "Reduce access now" control distinct from the negotiated "Edit permissions" flow.

### 6.6 Termination

| Cause | Trigger | `termination_reason` | Notification |
|---|---|---|---|
| Manual unlink | Either Admin clicks "Unlink" | `unlinked` | Email + dashboard notice to the other venue |
| Subscription lapse | Owning venue's `plan_status` leaves `'active'` or `pricing_tier` becomes ineligible | `subscription_lapsed` | 7-day advance email when the lapse is foreseeable; immediate suspension on lapse (§6.7) |
| Venue deleted | A venue row is deleted (`ON DELETE CASCADE` removes the link) | `venue_deleted` | Surviving venue emailed |
| Plan ineligibility | Venue moves to the restaurant table-reservation product | `plan_ineligible` | Both venues emailed |

On termination:

- All cross-venue visibility ceases immediately — the RLS helpers in §4.4 return `none`
  because the link is no longer `accepted`. No purge job is needed.
- `account_link_audit_log` is preserved and stays accessible to both venues under "Past
  links".
- Bookings that the linked venue created or edited **remain in the owning venue** — they were
  always owned by `venue_id`. `created_by_linked_venue_id` is retained for the historical
  record. **This is the data-sovereignty guarantee: breaking a link changes only access, never
  ownership.**
- Any venue collective depending on this pairwise link is re-evaluated (§7.5).

### 6.7 Subscription lapse handling

ReserveNI venues carry `plan_status` and (for Light) `light_plan_free_period_ends_at`. When a
linked venue's subscription is heading for lapse:

- **Foreseeable lapse** (Light free period ending without a payment method, or a scheduled
  cancellation): 7 days before the effective date, email all venues linked to it.
- **On lapse** (`plan_status` becomes `'past_due'` or `'cancelled'`): the daily maintenance
  cron sets affected links `status = 'suspended'`. Cross-venue visibility ceases; the audit
  log is preserved; the link still shows in both settings tabs as "Suspended — {venue}'s
  subscription is inactive".
- **Restored within 30 days** (`plan_status` back to `'active'`): the cron transitions the
  link back to `accepted` with its original grants.
- **Still suspended after 30 days:** the cron sets `status = 'expired'`,
  `termination_reason = 'subscription_lapsed'`. A fresh request is required to relink.

---

## 7. Venue collectives — combined booking page (Phase 2)

### 7.1 Concept

A venue collective is a public booking page combining two or more pairwise-linked venues
under shared branding:

- A single URL: `/book/c/{slug}` (the `c` segment keeps the collective namespace separate
  from the existing per-venue `/book/[venue-slug]` and per-practitioner
  `/book/[venue-slug]/[practitioner-slug]` routes).
- Combined service browsing, grouped `by_practitioner` or `by_service_type`.
- Optional "any available practitioner" routing for substitutable services.
- Shared branding (logo, colour, description) controlled by the host venue.

Each member venue's own `/book/[venue-slug]` page continues to operate unchanged. The
collective page is supplementary, served by the existing `BookPublicBookingFlow` component
(reused, as the embed route already does — see `Embed_Public_Booking_URL_Contract.md`) fed
with a multi-venue dataset.

### 7.2 Eligibility to form or join

Every (prospective) member must:

- Be an Appointments-family venue with `plan_status = 'active'`.
- Hold accepted pairwise `account_links` with **`full_details` in both directions** with
  every other member (a combined real-time-availability page cannot work with `time_only` or
  asymmetric visibility).
- Have explicitly accepted a collective invitation.

The Admin creating the collective must be Admin on the host venue. Invitations go to each
invitee's `venues.email` and active Admins, and must be accepted by an Admin on the invitee
venue.

### 7.2.1 Naming and slug uniqueness

- **Name:** a collective's `name` must be unique (case-insensitive) across all `active`
  `venue_collectives`. Names of dissolved collectives are released for reuse after 30 days.
- **Slug:** `venue_collectives.slug` has a DB `UNIQUE` constraint. Because collective pages
  live under the dedicated `/book/c/{slug}` path, the slug namespace does **not** collide
  with `venues.slug`; it must only be unique among collectives. Lowercase, hyphen-separated,
  validated live as the user types and re-checked on submit.
- Conflict errors must not disclose *which* venue or collective holds a conflicting name.

### 7.3 Creation flow

1. An Admin with ≥ 1 full-mutual link opens Linked Accounts tab → "Create venue collective".
2. Configure: `name`, `slug` (live availability check), `branding`, `service_grouping`,
   `allow_any_practitioner`.
3. Invite linked venues. Each invitee gets an email + dashboard banner.
4. Each invitee accepts and configures `visible_practitioner_ids`, `visible_service_ids`,
   `allow_any_practitioner_substitution`, and `display_order`.
5. Once ≥ 2 members are `active`, `/book/c/{slug}` goes live.

### 7.4 Host responsibilities and transfer

The host venue controls `name`, `slug`, `branding`, `service_grouping`,
`allow_any_practitioner`, member removal, and dissolution. The host may transfer host status
to any `active` member (who must accept). If the host venue leaves or is deleted, the system
requires host transfer first or auto-dissolves the collective.

### 7.5 Membership changes and link dependencies

If a pairwise link between two collective members ends, or is reduced below full mutual
visibility:

- Both affected venues are auto-removed (`status = 'removed'`).
- Remaining members are notified.
- If `active` membership drops below 2, the collective is dissolved (`status = 'dissolved'`).

This cascade is re-checked both on link-change events and on every public page render, since
RLS will already have cut off the data.

### 7.6 "Any practitioner" routing

When `allow_any_practitioner` is on at the collective level and a member opts in per service
(`allow_any_practitioner_substitution`), the page offers "Any available practitioner". On
selection the system finds the earliest slot across eligible `practitioners` (across member
venues), and the resulting `bookings` row is created **in the chosen practitioner's owning
venue** — `venue_id` and `practitioner_id` of that venue. Data ownership is unchanged.

### 7.7 Booking attribution and data flow

Collective pages are a routing layer, never a data layer. Every booking made through
`/book/c/{slug}` is a normal `bookings` row under exactly one `venue_id` / `practitioner_id`.
There is no "collective-level booking". A booking routed through the collective uses the
existing `booking_source` enum value `'online'` and may record the collective via a nullable
`bookings.collective_id` column if attribution reporting is wanted (optional; decide at
Phase 2 build).

### 7.8 Branding scope

Collective branding applies only to `/book/c/{slug}` and to confirmation communications for
bookings made through that page. Each venue's own booking page and comms keep their own
branding (`venues.logo_url`, etc.).

---

## 8. UI specification

### 8.1 Linked Accounts tab

Add a `linked-accounts` entry to the `TABS` array in
`src/app/dashboard/settings/SettingsView.tsx`, gated on `isAdmin` exactly as the `staff` and
`data-import` tabs are in `resolveInitialTab()`. Hide the tab entirely for
table-reservation venues. Direct navigation to `?tab=linked-accounts` by a non-Admin or a
restaurant venue falls back to `profile`.

The tab has four sections (rendered with the existing `SectionCard` component for visual
consistency):

1. **Active links** — accepted `account_links`. Each row: other venue name, permission
   summary per direction, date linked, "View audit log", "Edit permissions", "Reduce access
   now", "Unlink".
2. **Pending requests** — split "Sent by you" / "Received". Received rows offer Accept /
   Accept with changes / Reject; sent rows offer Cancel.
3. **Venue collectives** (Phase 2) — collectives the venue belongs to, with role (host /
   member), member count, status; "Create venue collective" when eligible.
4. **Past links** — `rejected`/`revoked`/`expired` links, retained for audit access. Each
   row: other venue name, period, termination reason, "View audit log". No reactivation from
   here — a fresh request is required.

### 8.2 Calendar and bookings page integration

`/dashboard/calendar`, `/dashboard/practitioner-calendar`, `/dashboard/day-sheet`:

- A legend lists all visible calendars; own `practitioners` render solid, linked-in
  practitioners render desaturated/patterned and labelled with the source venue name.
- Each linked-in calendar can be toggled in the view (a local view preference; does not
  affect the link).
- Bookings the viewer cannot edit (`act = 'none'`, or `time_only`) show a lock affordance.
- `time_only` linked bookings render as bare time blocks: "{Venue} — busy", no other detail.

`/dashboard/bookings` (list view):

- Linked-in bookings carry a clear indicator and a "Source: {venue name}" column.
- A filter toggles own only / linked-in only / all.
- Action buttons are hidden or disabled where the viewer lacks `act`.

### 8.3 Incoming-request banner

Persistent across dashboard pages until actioned, shown only to Admins:

> 🔗 **{Requester venue} wants to link with you.** [Review request] [Dismiss for 24h]

"Dismiss for 24h" hides it for 24 hours without rejecting. After 30 days the request expires
and the banner disappears.

### 8.4 Audit log view

Per-link, opened from the Linked Accounts tab. Paginated, filterable list backed by
`account_link_audit_log`:

- Date/time, acting user + acting venue, action, affected resource (linked if it still
  exists), before/after diff for edits.
- Filters: action type, date range, acting user.
- CSV export of the full log.

### 8.5 Booking widget behaviour

The embeddable widget configuration lives in
`src/app/dashboard/settings/widget/WidgetSection.tsx`:

- A venue with pairwise links but **no** collective: the widget is unchanged — it embeds only
  that venue's own `/embed/[venue-slug]` flow.
- A venue that is an `active` member of a collective: the widget config offers **two** embed
  options — "My venue only" (unchanged) and "Venue collective" (the combined
  `/book/c/{slug}` flow). Both remain available; the venue chooses per embed.
- No combined widget is offered for `time_only` links — they never qualify for a collective.

### 8.6 Cross-suggestion when fully booked

Collective-scoped only (not pairwise). When a customer finds no availability on a member
venue's own `/book/[venue-slug]` page:

- If that venue is in a collective: "{Venue} is fully booked this week. Other practitioners
  at {Collective name} have availability — [Try the {Collective} page]".
- If the venue only has pairwise links and no collective: no cross-suggestion (pairwise links
  imply no shared brand and may be between competitors).

---

## 9. Notifications

All link-related emails are sent via the existing **SendGrid** integration on the
authenticated domain, to the recipient venue's `venues.email` and to its active Admin staff.
Dashboard banners and in-app notices are shown only to Admins.

| Event | Channels | Recipient |
|---|---|---|
| Link request received | Email + dashboard banner | Receiving venue's `email` + Admins |
| Link request accepted | Email + dashboard notice | Requesting venue |
| Link request accepted with changes | Email + dashboard notice (with diff) | Requesting venue |
| Link request rejected | Email + dashboard notice | Requesting venue |
| Link request expired | Email | Both venues |
| Link unlinked by other venue | Email + dashboard notice | Surviving venue |
| Permission change proposed | Email + dashboard banner | Other venue |
| Permission reduced unilaterally | Email + dashboard notice | Other venue |
| Subscription lapse warning (7 days) | Email | All venues linked to the lapsing venue |
| Link suspended (lapse) | Email | All linked venues |
| Link resumed (subscription restored) | Email | All linked venues |
| Venue collective invitation | Email + dashboard banner | Invitee venue |
| Removed from venue collective | Email + dashboard notice | Removed member |
| Venue collective dissolved | Email | All members |

**SMS is out of scope for this feature.** ReserveNI's SMS path is metered per-venue (Twilio,
`increment_sms_usage`, billed to Stripe) and SMS is customer-facing operational/marketing
messaging — link administration is internal and email-only.

---

## 10. Audit and compliance

### 10.1 What is logged

Every cross-venue action writes an `account_link_audit_log` row (§4.2):

- **Reads:** calendar and booking-detail views, debounced to 5-minute windows per
  `(acting_user_id, resource_id)`.
- **Writes:** all cross-venue `bookings` INSERT / UPDATE (including status → `Cancelled`),
  with `before_state` / `after_state` JSON, written by the `bookings` audit trigger in the
  same transaction.

In addition, the owning venue's existing `events` log continues to receive
`booking_created` / `booking_status_changed` rows from `booking_events_trigger` — so the
owning venue has its native record regardless of who acted.

Both venues can read the full `account_link_audit_log` for a link at any time, including
after termination.

### 10.2 GDPR posture

A link is a controller-to-controller data-sharing arrangement between two venues. Each venue
remains the data controller for its own `guests`. The arrangement provides: explicit recorded
consent (link acceptance), a specified purpose (calendar coordination and booking
management), a full audit trail, easy revocation, and automatic data severance on
termination (severance is intrinsic — nothing is ever copied).

This should be reflected in:

- ReserveNI's Terms of Service, updated to describe linked accounts.
- A short data-sharing notice shown in the link-acceptance modal.
- Guidance to venues to update their own privacy policy when they link.

These updates should be reviewed by ReserveNI's Northern Ireland commercial solicitor before
launch.

### 10.3 Customer-facing disclosure

There is no per-booking customer-facing disclosure when a booking is made with a venue that
holds linked-account relationships. To the customer a booking appears as a normal booking
with the practitioner they chose. The linked relationship is operational and disclosed at the
venue's privacy-policy level, not per booking. ReserveNI onboarding documentation should
advise venues to update their privacy policy when they link.

---

## 11. Implementation phasing

### Phase 1 — pairwise links (MVP)

1. Migration: `link_status`, `link_calendar_visibility`, `link_action_level`,
   `link_termination_reason` enums; `account_links` and `account_link_audit_log` tables;
   `bookings.created_by_linked_venue_id` / `last_modified_by_linked_venue_id` columns; the
   `current_staff_venue_ids()` / `link_calendar_grant()` / `link_pii_grant()` /
   `link_action_grant()` helper functions; the `bookings_linked_anonymised` view; all RLS
   policies in §4.4; the `bookings` cross-venue audit trigger. CHECK constraints for §5.5.
2. RLS test suite (pgTAP or seeded integration tests) proving severance and time-only
   redaction **before** any UI is written.
3. `linked-accounts` tab in `SettingsView.tsx` with Active / Pending / Past sections.
4. Server routes under `/api/venue/account-links` for create / respond / edit / reduce /
   unlink, plus the Admin-only slug-lookup endpoint.
5. Incoming-request banner in the dashboard shell.
6. Calendar / bookings page integration (§8.2).
7. Audit log view with filters + CSV export.
8. `/api/cron/account-link-maintenance` daily cron (expiry, suspension, resume) registered
   in `vercel.json`, secured with `CRON_SECRET`.
9. SendGrid email templates for the §9 events.
10. Subscription-lapse handling wired into the cron and existing plan-status changes.

### Phase 2 — venue collectives

- `venue_collectives` / `venue_collective_members` tables and RLS.
- `/book/c/{slug}` combined booking page reusing `BookPublicBookingFlow`.
- Collective-aware widget option in `WidgetSection.tsx`.
- "Any practitioner" routing.
- Collective-scoped cross-suggestion on no-availability.

### Phase 3 — post-launch, demand-driven

- Saved permission presets / link templates.
- Bulk link requests.
- Analytics on linked-calendar usage.

---

## 12. Open questions — resolved

- **Venue identifier for link requests:** use `venues.slug` (already unique, already the
  public identifier). Email is not used. *(Resolved — §6.1.)*
- **Link request rate limits:** cap outgoing `pending` requests at 10 per venue and apply a
  7-day cooldown before re-requesting a venue that rejected a request. *(Resolved — to be
  enforced in the create route.)*
- **Audit log retention after subscription cancellation:** retained indefinitely;
  `account_link_audit_log` is each venue's own record of access to its own data and is never
  deleted. *(Resolved — §4.2, §10.)*
- **User-level authorisation:** Admin staff only. *(Resolved — §3.1.)*
- **Notification recipient:** `venues.email` plus active Admin staff. *(Resolved — §9.)*
- **Customer disclosure:** none per booking; policy-level only. *(Resolved — §10.3.)*
- **Collective naming/slug:** name unique among active collectives; slug unique among
  collectives under the dedicated `/book/c/{slug}` namespace. *(Resolved — §7.2.1.)*

---

## 13. Out of scope

- Merging or sharing `guests` rows across venues. Each `guests` row lives under one
  `venue_id` and is matched by `UNIQUE (venue_id, email)`.
- Cross-venue reporting/analytics dashboards spanning multiple venues.
- Cross-venue staff messaging or chat.
- Shared `venue_resources` (e.g. a wash basin) blocking availability across linked venues.
- Cross-venue staff rota or `practitioners` working-hours management.
- Revenue-sharing or chair-rent tracking between linked venues.
- Restaurant (table-reservation) venue participation in any form.
- SMS notifications for link events.

---

## 14. Decision log

**2026-05-17:** Rewritten against the live ReserveNI schema. Replaced the generic
account/calendar/client/booking model with `venues` / `practitioners` / `guests` /
`bookings`. Replaced `current_account_id()` with `current_staff_venue_ids()` and the
`link_*_grant()` helper functions, reflecting that a staff user may work at multiple venues.
Adopted the ordered-pair `account_links` shape (`venue_low_id` / `venue_high_id`). Reused the
existing `events` table + `booking_events_trigger` pattern for the owning-venue audit and
added `account_link_audit_log` for the cross-venue record. Renamed "venue groups" to "venue
collectives" to avoid colliding with ReserveNI's existing "venue" = account terminology, and
gave them a dedicated `/book/c/{slug}` route namespace. Confirmed eligibility is the
Appointments family (`light` / `plus` / `appointments` tiers) and that restaurant
table-reservation venues are excluded. Resolved the identifier question in favour of
`venues.slug`.

---

## End of specification

This document is the source of truth for the linked accounts feature. Any deviation during
implementation should be reflected back into this document. When briefing an AI coding
agent, reference sections by number rather than restating requirements.

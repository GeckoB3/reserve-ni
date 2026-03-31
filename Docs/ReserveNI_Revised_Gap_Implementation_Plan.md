# ReserveNI — Revised Gap Implementation Plan

**Based on forensic codebase review + strategic prioritisation**
**March 2026**

---

## 1. Summary of Changes from Original Gap Report

The original gap analysis identified 6 feature gaps across Tiers 1 and 2. This revised plan accepts 4 gaps for immediate implementation, defers 2 to post-launch sprints, adjusts the scope of one gap for faster delivery, and inserts the onboarding/landing page work as a critical-path sprint between the feature gaps and the deferred items.

| Gap | Original Plan | Revised Plan | Rationale |
|---|---|---|---|
| Gap 1: Calendar Block Edit | Sprint 1 | Sprint 1 — unchanged | Genuine usability bug, XS effort |
| Gap 2: Practitioner URLs | Sprint 1 | Sprint 1 — unchanged | Critical for beauty/health businesses |
| Gap 3: Guest/Client Profile | Sprint 2-3 | Sprint 2 — reduced scope | Inline expansion on list page, defer standalone profile page |
| Gap 4: Guest Tagging | Sprint 2 | Sprint 2 — unchanged | Must ship with Gap 3 for filtering to be useful |
| Gap 5: Post-Visit Feedback | Sprint 3 | Deferred to Sprint 5 | No paying customers yet; retention feature, not acquisition |
| Gap 6: Multi-Service Booking | Sprint 4 | Deferred to Sprint 4 | Complex, doesn't block launch, build after real user feedback |
| NEW: Onboarding & Landing Page | Not in gap report | Sprint 3 — inserted | Critical path to revenue; unblocks real signups |

---

## 2. Sprint Plan

### Sprint 1: Quick Wins — Block Edit + Practitioner URLs (2-3 days)

Two changes that immediately improve the Model B experience. Both are independent and can be built in parallel or sequence.

#### Gap 1: Calendar Block Edit (XS effort)

> **Cursor Prompt:**
>
> "Fix calendar block editing in the ReserveNI practitioner calendar. Currently, practitioner calendar blocks (breaks, blocked time) can be created and deleted, but an existing block cannot be edited to change its end time or reason.
>
> **API change** at `src/app/api/venue/practitioner-calendar-blocks/[id]/route.ts`:
> Add a PATCH handler. Accept `{ end_time?: string, reason?: string }` in the request body. Validate that the authenticated user owns the venue that owns this block (same RLS pattern as the existing DELETE handler). Update the block record and return the updated block.
>
> **Calendar UI change** at `src/app/dashboard/practitioner-calendar/PractitionerCalendarView.tsx`:
> Extend the existing blockModal state to include an optional `blockId` field. When a user clicks on an existing block in the calendar:
> - Open the block modal pre-filled with the block's current startTime, endTime, and reason.
> - Set `blockId` in the modal state.
> - The modal title should say 'Edit Block' instead of 'Block Time'.
> - Add a 'Delete' button (red, secondary) inside the modal that deletes the block using the existing DELETE endpoint, closes the modal, and refreshes the calendar.
> - The 'Save' button should check: if `blockId` exists, send a PATCH request to update the block. If `blockId` is null, send a POST request to create a new block (existing behaviour).
>
> **Test:** Create a block (e.g. 'Lunch' 12:00-13:00) → click the block → modal opens pre-filled → change end time to 13:30 → save → block visually resizes on the calendar → change reason to 'Long lunch' → save → reason updates. Click block → Delete → block removed from calendar."

#### Gap 2: Staff-Specific Booking URLs (M effort)

> **Cursor Prompt:**
>
> "Add practitioner-specific booking URLs to ReserveNI. Each practitioner in a Model B business should be able to have their own booking link (e.g. `/book/salon-x/sarah`) that takes clients directly to booking with that practitioner, skipping the practitioner selection step.
>
> **Database migration:** Create a new migration that adds a `slug` column to the `practitioners` table: `ALTER TABLE practitioners ADD COLUMN slug TEXT;` Add a unique index: `CREATE UNIQUE INDEX idx_practitioners_venue_slug ON practitioners (venue_id, slug) WHERE slug IS NOT NULL;`
>
> **API changes:**
> - `src/app/api/venue/practitioners/route.ts` — Add `slug` to the create and update schemas. Validate with regex: `/^[a-z0-9-]+$/`, max 64 characters, optional. On create/update, if a slug is provided, check uniqueness within the venue. Return slug in GET responses.
> - `src/app/api/booking/appointment-catalog/route.ts` — Support an optional `?practitioner_slug=` query parameter. When provided, filter the catalog to only return services offered by the practitioner with that slug. Return a 404 if the slug doesn't match any active practitioner.
>
> **New booking page** at `src/app/book/[venue-slug]/[practitioner-slug]/page.tsx`:
> Create a new server component. Fetch the venue by venue slug and the practitioner by practitioner slug. If either doesn't exist or the practitioner is inactive, show a 404 page. Pass a `lockedPractitionerId` prop to the booking flow component.
>
> **Booking flow change** at `src/components/booking/AppointmentBookingFlow.tsx`:
> Add an optional `lockedPractitionerId?: string` prop. When this prop is provided:
> - Skip the practitioner selection step entirely (do not render it).
> - Filter the service list to only show services that this practitioner offers (via `practitioner_services` join).
> - Pre-set the selected practitioner in state.
> - Show a small banner at the top of the booking flow: 'Booking with [Practitioner Name]' with the practitioner's photo if available.
> - Everything else (date, time, guest details, payment) works as normal.
>
> **Dashboard settings change** at `src/app/dashboard/settings/sections/StaffSection.tsx`:
> Add a 'Booking Link' field to the practitioner edit form:
> - Text input for the slug, with the prefix shown as non-editable: `reserveni.com/book/[venue-slug]/`
> - Below the input, show the full URL preview as a clickable link.
> - 'Copy Link' button that copies the full URL to clipboard with a success toast.
> - If the slug is empty, show: 'Add a URL to give [practitioner name] their own booking link.'
> - Validate slug format on change (lowercase, numbers, hyphens only).
>
> **Test:** Set slug 'sarah' on a practitioner → navigate to `/book/salon-x/sarah` → booking flow loads with 'Booking with Sarah' banner → practitioner step is skipped → only Sarah's services are shown → select service, date, time → complete booking → booking is assigned to Sarah. Navigate to `/book/salon-x/invalid-slug` → shows 404. Navigate to the main `/book/salon-x` → shows all practitioners as normal (existing flow unchanged)."

---

### Sprint 2: Client Management — Tags + Client List (3-4 days)

Guest tagging and the client list are built together because tags without a list to filter them have limited value, and a list without tags is missing the most requested CRM feature.

#### Gap 4: Guest Tags (migration + components)

> **Cursor Prompt:**
>
> "Add a guest tagging system to ReserveNI. This lets venue staff tag guests/clients with labels like 'VIP', 'Regular', 'Allergy', 'Difficult', 'Birthday Club', etc. Tags are free-text with autocomplete from existing tags used at the venue.
>
> **Database migration:** Create a new migration:
> ```sql
> ALTER TABLE guests ADD COLUMN tags TEXT[] NOT NULL DEFAULT '{}';
> CREATE INDEX idx_guests_tags ON guests USING gin(tags);
> ```
>
> **New API endpoint** at `src/app/api/venue/guests/tags/route.ts`:
> GET handler that returns all distinct tags used across guests at this venue: `SELECT DISTINCT unnest(tags) AS tag FROM guests WHERE venue_id = $1 ORDER BY tag`. This powers the autocomplete dropdown. Authenticated venue staff only.
>
> **Update** `src/app/api/venue/guests/[guestId]/route.ts`:
> Add `tags: z.array(z.string()).optional()` to the PATCH schema. When updating tags, replace the entire array (not append). Validate each tag is a non-empty trimmed string, max 30 characters. Limit to 20 tags per guest.
>
> **Update** `src/app/api/venue/bookings/[id]/route.ts` and `src/app/api/venue/bookings/list/route.ts`:
> Include `tags` in the guest data returned with each booking (add to the guest select/join).
>
> **New shared component** at `src/components/dashboard/GuestTagEditor.tsx`:
> A reusable tag editor component. Props: `tags: string[]`, `onTagsChange: (tags: string[]) => void`, `venueId: string`.
> Renders:
> - Existing tags as coloured pills (use a muted colour palette — e.g. blue, green, amber, purple, cycling through). Each pill has an × button to remove the tag.
> - An inline text input at the end: type to add a new tag, press Enter or comma to confirm.
> - As the user types, show a dropdown of existing venue tags (fetched from the tags endpoint) that match the input, filtered to exclude tags already applied. Click a suggestion or press Enter to add.
> - Empty state: show placeholder text 'Add a tag...'
>
> **Update** `src/app/dashboard/bookings/BookingDetailPanel.tsx`:
> In the guest information section of the booking detail panel, add the GuestTagEditor below the guest name and contact details. When tags are changed, PATCH the guest record and refresh the panel.
>
> **Update** `src/app/dashboard/day-sheet/DaySheetView.tsx`:
> For each booking row on the day sheet, render the guest's tags as small coloured pills alongside the existing dietary flags. Use a different colour to distinguish tags from dietary parsing (dietary = green-toned, tags = blue/purple-toned). Show a maximum of 3 tags per row; if more, show '+N' overflow indicator.
>
> **Test:** Open a booking detail → add 'VIP' tag → pill appears → close and reopen → tag persists. Add 'Regular' tag → both show. Remove 'VIP' → only 'Regular' remains. Open day sheet → booking shows 'Regular' tag pill alongside dietary info. Start typing 'V' in tag input → autocomplete suggests 'VIP' (from earlier). Open a different guest's booking → add 'VIP' from autocomplete → works. Tags are per-guest, not per-booking — adding a tag on one booking updates the guest record and appears on all of that guest's bookings."

#### Gap 3: Client List Page (reduced scope — inline expansion, no standalone profile page)

> **Cursor Prompt:**
>
> "Build a client/guest management list page for ReserveNI. This is a searchable, filterable, sortable list of all guests/clients at the venue, with inline expandable rows that show booking history and contact details. Do NOT build a separate standalone profile page — the inline expansion provides the same information without an extra navigation step.
>
> **New API endpoint** at `src/app/api/venue/guests/route.ts`:
> GET handler with query params: `?search=` (searches name, email, phone — case insensitive partial match), `?tags=` (comma-separated tag filter — guests must have ALL specified tags), `?sort=` (name_asc, name_desc, last_visit_desc, visit_count_desc, created_desc — default: last_visit_desc), `?page=` and `?limit=` for pagination (default limit 50).
> Return: array of guests with id, name, email, phone, tags, visit_count, no_show_count, last_visit_date (computed from most recent booking), created_at. Include total_count for pagination.
> Authenticated venue staff only. RLS filtered by venue_id.
>
> **New API endpoint** at `src/app/api/venue/guests/[guestId]/route.ts`:
> GET handler: return the full guest record plus their booking history (most recent 20 bookings with date, time, service/covers, status, practitioner name if Model B, deposit status). Include computed stats: total visits, no-shows, cancellations, total deposit revenue, first visit date, last visit date.
> PATCH handler: update name, email, phone, tags. Validate email format, phone format (E.164), tags array.
>
> **New page** at `src/app/dashboard/guests/page.tsx` (server wrapper) and `src/app/dashboard/guests/GuestsView.tsx` (client component):
>
> **List layout:**
> - Search bar at top: 'Search by name, email, or phone' — debounced 300ms, calls the API with search param.
> - Tag filter: multi-select dropdown populated from the venue's existing tags (same endpoint as tag autocomplete). Selecting tags filters the list to guests with those tags.
> - Sort dropdown: 'Last visit (newest)', 'Last visit (oldest)', 'Name (A-Z)', 'Name (Z-A)', 'Most visits', 'Recently added'.
> - Export CSV button (top right): calls the existing export endpoint or a new one that returns all guests as CSV (name, email, phone, tags, visit_count, no_show_count, last_visit_date).
>
> **List rows:**
> Each row shows: guest name, email (truncated if long), phone, first 3 tag pills (with +N overflow), visit count, last visit date, no-show count (red if > 0).
> Clicking a row expands it inline (accordion style — only one row expanded at a time) to show:
> - **Contact section:** full email (clickable mailto), full phone (clickable tel), editable name field with save button, GuestTagEditor.
> - **Stats row:** total visits, no-shows, cancellations, total deposits paid, first visit, last visit — as compact stat cards.
> - **Booking history:** a compact table/list of their most recent 20 bookings: date, time, service or covers, status (colour-coded pill), practitioner name (Model B). Each booking row is clickable and navigates to the booking detail in the main bookings page.
> - **Actions:** 'Edit details' (inline edit mode for name, email, phone), 'Export history' (CSV of this guest's bookings).
>
> **Dashboard navigation:**
> Update `src/app/dashboard/DashboardSidebar.tsx` to add a nav item:
> - For Model A (table_reservation): label 'Guests', icon Users
> - For Model B (practitioner_appointment): label 'Clients', icon Users
> - Use the existing terminology system (`t('clients', venue.business_type)`) to get the correct label.
> - Add the path to ADMIN_ONLY_HREFS so only admin staff can access the full client list.
>
> **Empty state:** When no guests exist yet: 'No [guests/clients] yet. They'll appear here automatically as bookings come in.'
>
> **Responsive:** On mobile, the list shows name, visit count, and tags only. Tap to expand shows the full detail. The search bar and filters stack vertically.
>
> **Test:** Create several bookings with different guests → navigate to Guests/Clients page → all guests appear → search 'John' → filtered → click a row → expands showing booking history and stats → add a 'VIP' tag inline → tag persists → use tag filter to show only VIP guests → works. Sort by visit count → guest with most bookings appears first. Export CSV → downloads file with all guest data."

---

### Sprint 3: Onboarding & Landing Page (5-7 days)

This is the critical path to revenue. No feature gaps matter if businesses cannot sign up, pay, and get configured. This sprint implements the onboarding flow from the ReserveNI Pricing & Onboarding Overview v4 document.

> **Cursor Prompt:**
>
> "Build the complete onboarding flow for ReserveNI as specified in the Pricing & Onboarding Overview v4 document. The flow takes a new user from the landing page through account creation, business type selection, plan selection, Stripe payment, venue setup wizard, and into their dashboard.
>
> Refer to the Pricing & Onboarding Overview v4 document for the full specification. The key requirements are:
>
> **Landing page at `/`:**
> General-purpose landing page for all NI bookable businesses. Hero section, business type showcase, two-tier pricing (Standard £10/calendar/month, Business £79/month flat), Founding Partner callout for restaurants, FAQ, footer. The pricing section should include an interactive calculator for Standard tier and highlight Business tier benefits (SMS, table management, priority support).
>
> **Signup at `/signup`:**
> Minimal form: email, password, terms checkbox. Create Supabase Auth account. Do not require email verification. Redirect to `/signup/business-type`.
>
> **Business type selection at `/signup/business-type`:**
> Grouped visual selector with all supported business types. Selection determines booking_model, terminology, defaults. Redirect to `/signup/plan`.
>
> **Plan selection at `/signup/plan`:**
> For Model A businesses (restaurants, cafes, pubs): show ONLY the Business plan at £79/month. No Standard option. Founding Partner option shown if ?plan=founding and spots remain.
> For all other models: show Standard (with calendar count selector and dynamic pricing) and Business side by side. Nudge toward Business at 8+ calendars.
>
> **Payment at `/signup/payment`:**
> Order summary, then redirect to Stripe Checkout. Standard uses STRIPE_STANDARD_PRICE_ID with quantity = calendar count. Business uses STRIPE_BUSINESS_PRICE_ID with quantity = 1. Founding Partners skip Stripe.
>
> **Stripe webhook at `/api/webhooks/stripe-subscription/route.ts`:**
> Handle checkout.session.completed (create venue record from metadata), customer.subscription.updated, invoice.payment_failed, customer.subscription.deleted. Idempotent. Verify signatures.
>
> **Setup wizard at `/onboarding`:**
> Route by booking_model. Model A: existing restaurant wizard (no changes). Model B: Your Business → Your Team → Your Services → Preview & Go Live. Models C/D/E: appropriate wizard steps per the overview document.
>
> **Dashboard first-time experience:**
> Welcome banner, setup checklist adapted to booking model, empty state with action prompts.
>
> **Communication engine tier check:**
> Update CommunicationService to check venue.pricing_tier. Standard tier: all communications via email only. Business/Founding tier: reminders and confirm-or-cancel via SMS, everything else via email.
>
> **Calendar limit enforcement:**
> Standard tier: prompt to increase subscription quantity when adding calendars beyond current count. Business tier: no limits.
>
> **Access control middleware:**
> Not authenticated → /login. No venue → /signup/business-type. Onboarding incomplete → /onboarding. Plan cancelled → resubscribe page. Otherwise → /dashboard routed by booking_model.
>
> **Environment variables needed:**
> STRIPE_STANDARD_PRICE_ID, STRIPE_BUSINESS_PRICE_ID, STRIPE_ONBOARDING_WEBHOOK_SECRET
>
> **Critical rules:**
> - Do NOT change existing restaurant dashboard, booking flows, or onboarding wizard.
> - Do NOT show Standard plan option to Model A businesses anywhere.
> - Do NOT send SMS for Standard tier businesses.
> - Do NOT show table management to non-restaurant businesses.
> - Restaurants on Business tier see full restaurant dashboard with table management.
> - Model B businesses on Business tier see practitioner dashboard with SMS enabled, NOT the restaurant dashboard."

---

### Sprint 4 (post-launch): Multi-Service Booking (3-5 days)

Build this after you have real feedback from beauty/health businesses confirming it's a priority. The implementation approach is sound — use the existing `group_booking_id` to link consecutive services.

> **Cursor Prompt:**
>
> "Add multi-service booking to ReserveNI for Model B (practitioner_appointment) businesses. Clients should be able to book two or more services in a single booking session, with the services scheduled consecutively with the same practitioner.
>
> **New API endpoint** at `src/app/api/booking/create-multi-service/route.ts`:
> Accept: `{ venue_id, booking_date, guest_details: { name, email, phone }, services: [{ service_id, practitioner_id, start_time }] }`.
> Validate:
> - All services must be with the same practitioner.
> - Times must be consecutive: each service starts at the previous service's end time plus the venue's buffer_minutes. No gaps, no overlaps.
> - Each individual slot must pass the existing availability check.
> - Guest identity matching runs once for the guest, not per service.
> Generate a shared `group_booking_id` (UUID). Create one booking record per service, all linked by group_booking_id. All bookings share the same guest_id, booking_date, and deposit details.
> If deposits are required: collect a single deposit for the combined total (sum of all service deposits), creating one Stripe PaymentIntent. Store the payment_intent_id on the first booking; other bookings in the group reference it.
> Send a single confirmation email/SMS listing all services and times.
>
> **Booking flow changes** at `src/components/booking/AppointmentBookingFlow.tsx`:
> After the user selects a service, practitioner, date, and time slot, add a new step before guest details:
> - Show: 'Your appointment: [service name] with [practitioner] at [time]'
> - Below: 'Would you like to add another service?' button.
> - If clicked: show the service selection filtered to the same practitioner. The available time for the second service is automatically the first service's end time + buffer. Show: '[Second service] at [calculated time]'.
> - Allow adding up to 3 additional services (4 total).
> - Show a running summary card listing all selected services with times and total duration.
> - 'Remove' button on each service in the summary.
> - When done adding services (or if they skip), proceed to guest details, then payment (single combined deposit), then confirmation.
>
> **New component** at `src/components/booking/MultiServiceSummaryCard.tsx`:
> A stacked summary showing each service as a row: service name, practitioner, start time, duration, price. Total at the bottom: combined duration, combined price, combined deposit.
>
> **Calendar display:**
> When multi-service bookings appear on the practitioner calendar, they should render as visually connected blocks (same colour, thin separator line between them rather than a gap). Hovering/clicking any block in the group shows the full multi-service summary. Cancelling one booking in a group cancels ALL bookings in the group and processes a single refund.
>
> **Staff booking form** (optional, can be a follow-up): Add an 'Add service' button to the staff appointment creation modal that works the same way — consecutive services with the same practitioner.
>
> **Test:** Select 'Haircut' (30min) with Sarah at 10:00 → click 'Add another service' → select 'Blow Dry' (20min) → auto-scheduled at 10:30 (after buffer) → summary shows both → enter guest details → pay combined deposit → two bookings created linked by group_booking_id → calendar shows connected blocks → cancel one → both cancelled → single refund processed."

---

### Sprint 5 (post-launch): Post-Visit Feedback (2-3 days)

Build this once venues have enough booking volume for feedback to be meaningful. The existing post-visit email template provides the hook — this sprint adds the feedback mechanism.

> **Cursor Prompt:**
>
> "Add post-visit feedback collection to ReserveNI for Model A (restaurants) and Model B (appointment businesses). After a booking is completed, the existing post-visit email should include a simple thumbs-up / thumbs-down feedback prompt. Feedback is collected on a standalone page and aggregated in the reports dashboard.
>
> **Database migration:**
> ```sql
> CREATE TABLE booking_feedbacks (
>   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
>   booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
>   venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
>   rating SMALLINT NOT NULL CHECK (rating IN (1, 2)),  -- 1 = thumbs down, 2 = thumbs up
>   comment TEXT,
>   submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
>   CONSTRAINT booking_feedbacks_booking_unique UNIQUE (booking_id)
> );
> CREATE INDEX idx_booking_feedbacks_venue ON booking_feedbacks (venue_id, submitted_at DESC);
> ```
> Add RLS policy: service role only for insert (public API uses service role), venue staff can SELECT for their own venue_id.
>
> **New API endpoint** at `src/app/api/feedback/[bookingId]/route.ts`:
> GET: check if feedback has already been submitted for this booking (return `{ submitted: boolean }`). Authorised by confirm token (same pattern as the manage booking page — verify token hash).
> POST: accept `{ rating: 1|2, comment?: string, token: string }`. Verify the token. Check the booking belongs to a real venue. Check feedback hasn't already been submitted. Insert into booking_feedbacks. Return success.
>
> **Update email template** at `src/lib/emails/templates/post-visit.ts`:
> Add a `feedbackUrl` parameter. When provided, render two CTA buttons:
> - '👍 Great experience' — links to `/feedback/[bookingId]?rating=2&token=[token]`
> - '👎 Could be better' — links to `/feedback/[bookingId]?rating=1&token=[token]`
> Below the buttons: 'Tap to let [venue name] know how your visit went.'
>
> **Update cron job** at `src/app/api/cron/send-communications/route.ts`:
> In the sendPostVisitEmails() function: for each booking being emailed, ensure a confirm_token_hash exists (generate one if missing — this handles staff-created bookings that may not have had a token). Build the feedback URL with the token. Pass feedbackUrl to the post-visit template.
>
> **New feedback page** at `src/app/feedback/[bookingId]/page.tsx` and `src/app/feedback/[bookingId]/FeedbackView.tsx`:
> A standalone page (no dashboard layout — this is a public guest-facing page).
> On load: read `rating` and `token` from URL params. Verify the token via GET endpoint. If already submitted, show: 'You've already shared your feedback. Thank you!'
> If valid and not submitted: auto-submit the rating from the URL param (the click on the email button IS the rating submission). Then show a thank-you screen:
> - 'Thanks for your feedback!'
> - If rating was thumbs up: '😊 Glad you had a great time at [venue name].'
> - If rating was thumbs down: 'We're sorry to hear that. Your feedback helps [venue name] improve.'
> - Below: an optional comment textarea: 'Want to share more? (optional)' with a 'Submit' button. On submit, PATCH the feedback record to add the comment (or send a second POST — either approach works).
> - Mobile-friendly, clean design, venue branding (name and logo).
>
> **Reports integration:**
> New API endpoint at `src/app/api/venue/reports/feedback/route.ts`: return aggregate stats for a date range — total feedback count, thumbs up count, thumbs down count, positive percentage, and the 10 most recent comments with ratings and dates.
> Update `src/app/dashboard/reports/ReportsView.tsx`: add a 'Guest Feedback' section (visible to admins only):
> - Summary cards: total responses, positive rate (as percentage with colour — green if >80%, amber if 50-80%, red if <50%), response rate (feedbacks received / completed bookings).
> - Recent comments list: date, rating icon (👍/👎), comment text, guest name.
> - Date range filter consistent with other reports.
>
> **Test:** Booking is completed → post-visit cron runs → email sent with two buttons → click thumbs up → auto-submits → thank-you page with optional comment → type comment → submit → appears in reports dashboard. Click thumbs down on a different booking → shows empathetic message → add comment → appears in reports. Try clicking the link again → shows 'already submitted'. Check reports → positive percentage accurate → comments listed in order."

---

## 3. Pre-Sprint Action Item: Reserve with Google

Before starting Sprint 1, submit the Reserve with Google application if not already done. The approval process takes 8-12 weeks and runs in parallel with all development work. There is no code to write — it's an application and review process. When approval comes through, integration becomes a future sprint with the BAPI endpoints already documented in the Tier 3 backlog.

---

## 4. Regression Testing Protocol

After EVERY sprint, run these end-to-end tests before merging:

**Model A (Restaurant) full flow:**
1. Guest visits booking page → selects date, time, party size → pays deposit → receives confirmation email → booking appears on dashboard and day sheet.
2. 24-hour reminder cron fires → guest receives reminder (SMS for Business tier, email for Standard) → clicks confirm-or-cancel link → confirms → status updates.
3. Guest arrives → staff checks in on day sheet → marks completed → post-visit email sends (Sprint 5+).

**Model B (Appointment) full flow:**
1. Guest visits booking page → selects service, practitioner, date, time → pays deposit → receives confirmation email → booking appears on calendar.
2. Guest visits practitioner-specific URL (Sprint 1+) → practitioner pre-selected → services filtered → booking completes.
3. 24-hour reminder fires → guest receives reminder via appropriate channel for tier → confirms → status updates.
4. Staff opens calendar → drag-drops an appointment to different time → booking updates → client is notified.

**Billing flow:**
1. New restaurant signup → Business plan only → Stripe Checkout → venue created → restaurant dashboard loads.
2. New barber signup → Standard with 1 calendar → Stripe Checkout → venue created → practitioner dashboard loads → email-only communications.
3. Standard user adds a calendar → subscription quantity increases → new monthly amount shown in settings.

**No regressions on:**
- Booking creation (both models)
- Booking status transitions (confirm, seat, complete, no-show, cancel)
- Deposit collection and refund flows
- Email and SMS sending (correct channels per tier)
- Day sheet, table grid, and floor plan (Model A)
- Practitioner calendar (Model B)
- Reporting data accuracy

---

## 5. Files Changed Summary

| File | Sprint | Change |
|---|---|---|
| `src/app/api/venue/practitioner-calendar-blocks/[id]/route.ts` | 1 | Add PATCH handler |
| `src/app/dashboard/practitioner-calendar/PractitionerCalendarView.tsx` | 1 | Block edit modal |
| `supabase/migrations/..._practitioner_slug.sql` | 1 | Add slug column |
| `src/app/api/venue/practitioners/route.ts` | 1 | Slug in schema |
| `src/app/api/booking/appointment-catalog/route.ts` | 1 | Filter by practitioner_slug |
| `src/app/book/[venue-slug]/[practitioner-slug]/page.tsx` | 1 | New page |
| `src/components/booking/AppointmentBookingFlow.tsx` | 1, 4 | lockedPractitionerId; multi-service |
| `src/app/dashboard/settings/sections/StaffSection.tsx` | 1 | Slug field + copy link |
| `supabase/migrations/..._guest_tags.sql` | 2 | Add tags column |
| `src/app/api/venue/guests/tags/route.ts` | 2 | New — tag autocomplete |
| `src/app/api/venue/guests/route.ts` | 2 | New — paginated guest list |
| `src/app/api/venue/guests/[guestId]/route.ts` | 2 | New — guest detail + PATCH |
| `src/components/dashboard/GuestTagEditor.tsx` | 2 | New — shared tag component |
| `src/app/dashboard/bookings/BookingDetailPanel.tsx` | 2 | Add tag editor |
| `src/app/dashboard/day-sheet/DaySheetView.tsx` | 2 | Render guest tags |
| `src/app/dashboard/guests/page.tsx` | 2 | New — guests list page |
| `src/app/dashboard/guests/GuestsView.tsx` | 2 | New — list with inline expansion |
| `src/app/dashboard/DashboardSidebar.tsx` | 2 | Add Guests/Clients nav |
| Landing page, signup, plan, payment, onboarding pages | 3 | New — full onboarding flow |
| `src/lib/communications/service.ts` | 3 | Tier-aware channel routing |
| `src/app/api/webhooks/stripe-subscription/route.ts` | 3 | Subscription webhooks (Stripe Dashboard URL: `/api/webhooks/stripe-subscription`) |
| `src/app/api/booking/create-multi-service/route.ts` | 4 | New — multi-service endpoint |
| `src/components/booking/MultiServiceSummaryCard.tsx` | 4 | New — summary component |
| `supabase/migrations/..._booking_feedbacks.sql` | 5 | Create feedbacks table |
| `src/app/api/feedback/[bookingId]/route.ts` | 5 | New — feedback submission |
| `src/app/feedback/[bookingId]/page.tsx` | 5 | New — feedback page |
| `src/lib/emails/templates/post-visit.ts` | 5 | Add feedback buttons |
| `src/app/api/cron/send-communications/route.ts` | 5 | Generate tokens, pass URL |
| `src/app/api/venue/reports/feedback/route.ts` | 5 | New — feedback aggregation |
| `src/app/dashboard/reports/ReportsView.tsx` | 5 | Add feedback section |

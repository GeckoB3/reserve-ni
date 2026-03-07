# ReserveNI — Availability Engine Improvement Plan

**Comprehensive Analysis & Implementation Guide for Cursor AI Agent**
**March 2026 | Version 1.0**

---

## 1. Industry Analysis: How the Best Platforms Manage Availability

This section analyses how the leading restaurant booking platforms (ResDiary, OpenTable, SevenRooms, Tablein, Eat App, and others) approach availability and capacity management. The goal is to identify the gold-standard patterns that ReserveNI should adopt.

### 1.1 The Two Fundamental Approaches

Restaurant booking platforms universally use one of two core availability models, or a hybrid of both:

**Approach A: Covers-Based (Yield Management)**

This is what ReserveNI currently uses. The restaurant sets a total capacity (e.g. 60 covers) and defines rules about how many covers or bookings can be accepted per time interval. It is simpler to configure and works well for restaurants that do not want to manage individual tables. ResDiary is the most sophisticated practitioner of this model, calling it "Yield Management". Their system allows venues to set maximum covers AND maximum bookings per timeslot simultaneously, with whichever limit is hit first taking precedence. They also allow day-of-week and time-of-day overrides on these limits.

**Approach B: Table-Based (Floor Plan)**

OpenTable, SevenRooms, and Eat App primarily use table-level management. Each physical table is defined with a min/max party size. The system checks whether a specific table can accommodate the requested party for the required duration, factoring in turn time. SevenRooms goes furthest with an AI-driven auto-seating algorithm that evaluates thousands of table combinations per second to maximise occupancy. OpenTable offers "Smart Assign" which recommends optimal table assignments.

**Approach C: Hybrid (Gold Standard)**

The most effective platforms combine both approaches. They have table-level awareness but layer yield management rules on top. This means even if physical tables are available, the system can throttle intake to protect kitchen and service capacity. ResDiary achieves this by having both table plans AND covers-per-slot limits, with whichever constraint is tighter being the binding one.

### 1.2 Key Concepts from Industry Leaders

| Concept | ResDiary | OpenTable | SevenRooms |
|---|---|---|---|
| Availability Model | Covers + tables hybrid with yield management | Table-first with "static book" slots per shift | Table-first with AI auto-seating algorithm |
| Timeslot Interval | Configurable (typically 15 min) | 15-minute blocks | Configurable intervals |
| Turn Time | Per-service, varies by covers/day/time | Per-table with POS auto-statusing | Per-table with real-time spend tracking |
| Duration Rules | Varies by party size, day, and time | Based on historical turn time data | Custom table statuses (e.g. "Last Round") |
| Throttling | Dual covers + bookings per slot | Slots per shift with pacing | Reservation pacing per interval |
| Table Grouping | Table groups for large parties | Flexible table combinations | Dynamic table linking |
| Short-Sell Protection | Rules: min covers per table size | Party size matching per table | AI optimises party-to-table fit |

### 1.3 The Gold Standard: What ReserveNI Should Target

Based on analysis of these platforms, the gold standard for an independent-restaurant-focused MVP like ReserveNI is a layered availability engine that is simple to configure but powerful enough to prevent common revenue leakage. The key principles are:

1. **Service Periods as the foundation** — Restaurants think in services (lunch, dinner), not arbitrary time ranges. Each service should have its own capacity rules, turn times, and booking windows.
2. **Dual-constraint yield management** — Limit both the number of covers AND the number of bookings per timeslot. A table of 8 arriving at the same time as 4 tables of 2 creates very different kitchen pressure despite similar cover counts.
3. **Party-size-aware duration** — A couple takes 75 minutes; a table of 6 takes 120 minutes. Duration should scale automatically based on party size, with venue override capability.
4. **Day-of-week and time-of-day granularity** — Friday 7pm and Tuesday 7pm are fundamentally different. Rules should be configurable at this level without requiring complex setup.
5. **Smart defaults with easy overrides** — The system should suggest sensible configurations based on restaurant type, and allow quick adjustments. Most independent restaurants will not spend 30 minutes configuring granular rules.
6. **Booking window controls** — How far in advance and how close to the time can guests book? Lead time restrictions protect against last-minute chaos.
7. **Override capability** — Staff must be able to manually override any automated restriction for walk-ins, VIPs, or judgment calls.

---

## 2. Current ReserveNI Availability Engine Assessment

Based on the known architecture (Next.js / Supabase / Stripe Connect / Vercel), the current MVP availability engine works on a covers-based model. This section identifies what exists and what gaps need to be addressed.

### 2.1 What the MVP Likely Has

- Total venue capacity (max covers)
- Operating hours per day
- Booking interval (e.g. every 15 or 30 minutes)
- Turn time (single global value)
- Basic availability calculation: for a given time, count existing covers and check against capacity
- Deposit collection via Stripe Connect
- Guest communications via Twilio/SendGrid

### 2.2 Key Gaps vs. Gold Standard

| Gap Area | Current State (Likely) | Gold Standard Target |
|---|---|---|
| Service Periods | Single operating hours block | Named services (Lunch, Dinner) with independent rules |
| Yield Management | Total capacity check only | Covers AND bookings per slot, with day/time overrides |
| Duration by Party Size | Single turn time for all | Duration matrix: party size × day × time |
| Booking Lead Time | Possibly none or basic | Min advance time, max advance days, last-booking cutoff per service |
| Day-of-Week Rules | Same rules every day | Capacity, hours, and deposit rules vary by day |
| Party Size Limits | Max party size only | Min/max online, large party redirect to phone, different deposits by size |
| Block-Out / Overrides | Manual or none | Date/time/slot blocks, special event overrides, manual add capability |
| Dashboard Insights | Basic booking list | Visual capacity heatmap, covers forecast, utilisation %, revenue projections |

---

## 3. Comprehensive Improvement Plan

This plan is structured in three phases, each delivering tangible value. Phase 1 focuses on the core engine improvements, Phase 2 on the dashboard and venue owner experience, and Phase 3 on advanced features. Each phase includes specific Cursor agent prompts.

### Phase 1: Core Availability Engine Overhaul

**Priority: HIGH.** This is the foundation that everything else builds on.

#### 3.1 Database Schema Changes

The following new tables and columns are needed in Supabase:

**A) `venue_services` table** — Replaces the single operating hours concept. Each venue can have multiple named services (e.g. Lunch, Dinner, Brunch). Fields: `id`, `venue_id`, `name`, `day_of_week` (0-6 array or bitmask), `start_time`, `end_time`, `last_booking_time`, `is_active`, `sort_order`, `created_at`. Each service carries its own independent configuration for everything below.

**B) `service_capacity_rules` table** — Yield management per service. Fields: `id`, `service_id`, `max_covers_per_slot`, `max_bookings_per_slot`, `slot_interval_minutes` (15/30/60), `buffer_minutes` (turn time between seatings). Add optional `day_of_week` and `time_range_start`/`time_range_end` columns for override rows, allowing a venue to say "Friday dinner accepts only 10 covers per 15-min slot between 19:00-20:30 instead of the default 15".

**C) `party_size_durations` table** — Maps party size ranges to dining durations per service. Fields: `id`, `service_id`, `min_party_size`, `max_party_size`, `duration_minutes`, `day_of_week` (nullable for overrides). Example: parties of 1-2 get 75 min, 3-4 get 90 min, 5-6 get 120 min, 7+ get 150 min.

**D) `booking_restrictions` table** — Controls on when/how bookings can be placed. Fields: `id`, `service_id`, `min_advance_minutes` (e.g. 60 = must book at least 1 hour ahead), `max_advance_days` (e.g. 60 = can book up to 60 days ahead), `min_party_size_online`, `max_party_size_online`, `large_party_threshold` (above this, redirect to phone/message), `deposit_required_from_party_size`, `deposit_amount_override`.

**E) `availability_blocks` table** — Manual overrides and closures. Fields: `id`, `venue_id`, `service_id` (nullable = whole venue), `block_type` (closed/reduced_capacity/special_event), `date_start`, `date_end`, `time_start` (nullable), `time_end` (nullable), `override_max_covers` (nullable), `reason`, `created_by`.

**F) Enhance existing `bookings` table** — Add: `service_id` (FK to venue_services), `estimated_end_time` (calculated from party_size_durations at booking time), `actual_seated_time`, `actual_departed_time` (for future analytics).

#### 3.2 Availability Calculation Engine (Back End)

The core function that determines available slots must be rewritten. The new algorithm works as follows:

1. Identify active services for the requested date (check `day_of_week` and `is_active`).
2. For each service, generate timeslots from `start_time` to `last_booking_time` at the configured interval.
3. For each slot, look up the applicable capacity rule (checking for day/time overrides first, falling back to defaults).
4. Count existing confirmed bookings that overlap the slot (a booking "occupies" from its `start_time` to `start_time + duration + buffer`). Both covers count and booking count are tracked.
5. Check the `availability_blocks` table for any closures or capacity reductions on this date/time.
6. Check `booking_restrictions` for lead time validity (is the requested time far enough in advance? not too far ahead?).
7. Check party size constraints from `booking_restrictions`.
8. A slot is available if: `covers_remaining >= requested_party_size` AND `bookings_remaining >= 1` AND no blocking override exists AND lead time rules pass AND party size is within online limits.
9. Return available slots with metadata: remaining covers, remaining bookings, estimated dining duration for this party size.

This engine should be implemented as a Supabase Edge Function or a server-side Next.js API route, NOT as client-side logic. The function should be optimised for speed as it will be called on every guest interaction with the booking page.

#### 3.3 API Endpoints to Create or Update

- **`GET /api/venues/[slug]/availability?date=YYYY-MM-DD&party_size=N`** — Returns all available timeslots for the given date and party size. Each slot includes: time, service_name, covers_remaining, estimated_duration, deposit_required, deposit_amount.
- **`GET /api/venues/[slug]/services`** — Returns configured services for the venue (used by the booking widget to show service-grouped times).
- **`POST /api/dashboard/services`** — CRUD for venue services (dashboard use).
- **`POST /api/dashboard/capacity-rules`** — CRUD for yield management rules.
- **`POST /api/dashboard/availability-blocks`** — Create/manage closures and overrides.
- **`POST /api/dashboard/party-size-durations`** — Configure duration rules.

---

### Phase 2: Dashboard Improvements for Venue Owners

**Priority: HIGH.** This is what venue owners interact with daily. It must be intuitive and informative.

#### 3.4 Availability Settings Hub (New Dashboard Section)

Replace any existing basic settings with a comprehensive "Availability & Capacity" section that is organised into clear tabs:

**Tab 1: Services** — Visual cards for each service (Lunch, Dinner, etc). Each card shows: name, active days (checkboxes), start/end times, last booking time, on/off toggle. An "Add Service" button creates new services. Drag to reorder. Each card has an "Edit Rules" button that opens the detail view for that service.

**Tab 2: Capacity Rules (per service)** — Shows the default max covers per slot, max bookings per slot, slot interval, and buffer/turn time. Below the defaults, a visual grid (days of week across the top, timeslots down the side) lets owners click to set overrides. Use colour coding: green = default applies, amber = custom lower limit, red = blocked. This is inspired by ResDiary's yield management grid but simplified for independent operators.

**Tab 3: Dining Duration** — A simple table showing party size ranges and their allocated dining time per service. Editable inline. Include smart defaults: the system should pre-populate sensible durations (75/90/105/120 min for 1-2/3-4/5-6/7+ covers) that the owner can adjust. A tooltip explains: "This controls how long each booking occupies capacity. Longer durations mean fewer seatings per evening but a more relaxed experience for guests."

**Tab 4: Booking Rules** — Controls for: minimum advance booking time, maximum advance days, online party size limits, large party threshold with custom message (e.g. "For parties of 8+, please call us on..."), deposit thresholds by party size, cancellation window.

**Tab 5: Closures & Overrides** — A calendar view showing any blocked dates or special events. Owners can click a date to add a closure (whole day or specific service), reduce capacity for a date, or create a special event with custom capacity. Future enhancement: allow special menus/pricing for events.

#### 3.5 Dashboard Home / Overview Improvements

The main dashboard view should give venue owners an at-a-glance understanding of their booking situation:

**Capacity Heatmap** — A weekly view (Mon-Sun across, timeslots down) showing fill rate by colour. Green (<50%), amber (50-80%), red (>80%), dark red (full). This lets owners instantly see where they have availability to promote and where they are at risk of overbooking. Each cell shows "X/Y covers".

**Today's Service Summary** — Cards for each active service showing: total covers booked, percentage capacity used, number of bookings, expected revenue (covers × average deposit or estimated spend), next upcoming booking.

**7-Day Covers Forecast** — A simple bar chart showing expected covers per day for the next 7 days. Helps with staffing and prep decisions.

**Actionable Alerts** — Smart notifications such as: "Friday dinner is 90% full — consider opening additional capacity", "You have 3 unconfirmed bookings for tonight", "No bookings yet for Tuesday lunch — promote on social media?", "Cancellation: Table for 4 freed up for Saturday 19:30".

#### 3.6 Contextual Help & Onboarding

Independent restaurant owners are not tech-savvy by default. Every configuration option should have:

- A brief plain-English description visible at all times (not hidden behind a tooltip)
- An "info" icon that expands to show a worked example (e.g. "If you set max covers per slot to 12 with 15-minute intervals, and a party of 6 books at 19:00, only 6 more covers can book between 19:00-19:14")
- Sensible defaults pre-populated based on a simple onboarding question: "What type of restaurant are you?" (Casual/Fine Dining/Cafe/Bar) which auto-sets appropriate turn times, intervals, and durations
- A "Preview" mode where owners can test their configuration by simulating a booking attempt to see what a guest would experience
- A guided setup wizard for new venues that walks through services, capacity, and durations step by step before the booking page goes live

---

### Phase 3: Advanced Features (Post-Core)

**Priority: MEDIUM.** Implement after Phases 1 and 2 are stable and tested.

#### 3.7 Waitlist / Standby

When a timeslot is fully booked, offer guests the option to join a standby list. If a cancellation occurs, automatically notify standby guests in order. ResDiary caps standby capacity at 50% of the slot's cover limit, which is a sensible starting point. The standby notification should include a time-limited link to confirm the booking (e.g. 30 minutes to respond before the next person is notified).

#### 3.8 Table-Aware Mode (Optional Upgrade)

For venues that want table-level control, add an optional layer that maps physical tables (with name, min/max covers, zone/area). The availability engine would then check both the covers-based yield rules AND table-level availability. This is a significant undertaking but positions ReserveNI to compete with ResDiary and OpenTable. Start with a simple floor plan editor where owners can add rectangular/circular table shapes and assign properties.

#### 3.9 Analytics & Reporting

- Covers by service, day of week, and time — trend over weeks/months
- Average party size trends
- No-show rate and cancellation rate by service/day
- Utilisation rate: actual covers vs. maximum capacity per service
- Deposit revenue summary
- Peak demand identification: which slots fill up first and fastest
- Suggested capacity adjustments based on historical patterns

#### 3.10 Guest-Facing Booking Page Improvements

- Show service names ("Dinner" not just a list of times) so guests understand the grouping
- Display estimated dining duration at booking confirmation ("Your table is reserved for approximately 90 minutes")
- Smart alternatives: if requested slot is full, suggest the nearest available times
- Party size validation with friendly redirect for large groups
- Visual availability indicator (e.g. "Only 2 tables remaining at this time") for urgency without dishonesty
- Special requests field with categorised quick-select options (birthday, anniversary, dietary, highchair, wheelchair access)

---

## 4. Cursor AI Agent Implementation Plan

This section provides detailed, sequenced prompts for implementing the improvements using the Cursor AI agent. Each prompt is designed to be self-contained and buildable on the previous step. They follow the same Prompt-by-Prompt convention used in the existing ReserveNI build sequence.

### Prompt 8: Database Schema — Service Periods & Capacity Rules

> **Cursor Prompt:**
>
> "Create Supabase migrations for the availability engine overhaul. Add these tables: (1) `venue_services` — `id` (uuid PK), `venue_id` (FK venues), `name` (text, e.g. 'Dinner'), `days_of_week` (int[] for 0=Sun through 6=Sat), `start_time` (time), `end_time` (time), `last_booking_time` (time), `is_active` (boolean default true), `sort_order` (int), `created_at` (timestamptz). (2) `service_capacity_rules` — `id` (uuid PK), `service_id` (FK venue_services), `max_covers_per_slot` (int), `max_bookings_per_slot` (int), `slot_interval_minutes` (int default 15), `buffer_minutes` (int default 15, this is turn time), `day_of_week` (int nullable for day-specific overrides), `time_range_start` (time nullable), `time_range_end` (time nullable), `created_at`. (3) `party_size_durations` — `id` (uuid PK), `service_id` (FK), `min_party_size` (int), `max_party_size` (int), `duration_minutes` (int), `day_of_week` (int nullable). (4) `booking_restrictions` — `id` (uuid PK), `service_id` (FK), `min_advance_minutes` (int default 60), `max_advance_days` (int default 60), `min_party_size_online` (int default 1), `max_party_size_online` (int default 10), `large_party_threshold` (int nullable), `large_party_message` (text nullable), `deposit_required_from_party_size` (int nullable), `created_at`. (5) `availability_blocks` — `id` (uuid PK), `venue_id` (FK), `service_id` (FK nullable, null = whole venue), `block_type` (enum: closed, reduced_capacity, special_event), `date_start` (date), `date_end` (date), `time_start` (time nullable), `time_end` (time nullable), `override_max_covers` (int nullable), `reason` (text), `created_by` (uuid FK), `created_at`. Also add `service_id` (uuid FK venue_services nullable) and `estimated_end_time` (timestamptz) columns to the existing bookings table. Add RLS policies: venue staff can CRUD their own venue's data, all tables secured by venue_id chain. Add a migration to create a default 'Dinner' service for any existing venues, carrying over their current operating hours. Seed the `party_size_durations` with sensible defaults (1-2: 75min, 3-4: 90min, 5-6: 120min, 7+: 150min). Seed `booking_restrictions` with the defaults shown. Seed `service_capacity_rules` using the venue's existing max_covers value divided by their current number of bookable slots."

### Prompt 9: Availability Calculation Engine

> **Cursor Prompt:**
>
> "Rewrite the availability calculation engine. Create a new server-side utility at `lib/availability-engine.ts`. The main exported function should be `getAvailableSlots(venueId: string, date: string, partySize: number)`. The algorithm: (1) Fetch all active `venue_services` for this venue where the requested date's day-of-week is in `days_of_week`. (2) For each service, fetch the capacity rules (with any day/time overrides), `party_size_durations`, and `booking_restrictions`. (3) Validate: is the date within `min_advance_minutes` and `max_advance_days`? Is partySize within min/max online limits? (4) Generate timeslots from service `start_time` to `last_booking_time` at `slot_interval_minutes` spacing. (5) For each slot, calculate remaining capacity: query confirmed bookings that overlap this slot (a booking occupies from `booking_time` to `booking_time + duration_minutes + buffer_minutes`). Count both total covers and total bookings in that window. (6) Check `availability_blocks` for closures or reduced capacity. (7) A slot is available if: `covers_booked + partySize <= effective_max_covers` AND `bookings_count < effective_max_bookings` AND no closure block applies. (8) Return array of `{ time, serviceName, serviceId, available: boolean, coversRemaining, bookingsRemaining, estimatedDuration, depositRequired, depositAmount }`. Update the existing `GET /api/venues/[slug]/availability` endpoint to use this new engine. Keep backward compatibility with the existing booking page. Add comprehensive error handling and input validation. Write unit tests for the engine covering: normal availability, full slot, partial capacity, day-of-week overrides, time-range overrides, blocked dates, large party rejection, advance booking limits. The function must be performant — aim for under 100ms for a single date query by batching database calls."

### Prompt 10: Booking Flow Integration

> **Cursor Prompt:**
>
> "Update the booking creation flow to work with the new availability engine. When a booking is created: (1) Re-validate availability using the engine (prevent race conditions with a Supabase advisory lock or optimistic concurrency check). (2) Look up the duration from `party_size_durations` for this service/party size and store `estimated_end_time` on the booking. (3) Store the `service_id` on the booking. (4) Check deposit rules from `booking_restrictions` — if the party size meets the deposit threshold, require deposit. (5) Update the confirmation email to include estimated dining duration ('Your table is reserved for approximately 90 minutes'). (6) Update the booking API response to return the service name and duration. (7) Add a server-side validation that rejects bookings where the slot has become full between the guest viewing availability and submitting (return a 409 Conflict with a friendly message and the next available alternatives). (8) Handle the `large_party_threshold`: if partySize >= threshold, don't allow online booking — instead return a message with the `large_party_message` from `booking_restrictions`. Test the full flow end-to-end."

### Prompt 11: Guest Booking Page — Frontend Improvements

> **Cursor Prompt:**
>
> "Improve the public booking page at `/[slug]` to work with the new service-based availability. Changes: (1) Group available timeslots by service name (show 'Lunch' and 'Dinner' as separate sections with headers, not a flat list). (2) If no slots are available for the selected date/party size, show a helpful message with 'Try nearby dates' links for the next 3 dates that DO have availability (requires a lightweight multi-date check). (3) When a timeslot is selected, show a summary card with: time, party size, estimated duration, deposit amount (if applicable), and service name. (4) Add a special requests field with quick-select chips: Birthday, Anniversary, Dietary Requirements, Highchair Needed, Wheelchair Accessible, Window Seat Preferred (these should be configurable per venue in future, but hardcode a sensible default set for now). (5) If the party size exceeds the large party threshold, show the venue's custom message instead of timeslots (e.g. 'For parties of 8 or more, please contact us at...'). (6) Add subtle availability urgency indicators: if a slot has less than 30% capacity remaining, show 'Limited availability' in amber text. (7) Ensure the page is fully responsive and loads fast — use skeleton loading states for the timeslot grid. (8) Keep the existing clean design aesthetic but refine spacing and typography for a more polished feel."

### Prompt 12: Dashboard — Availability Settings Hub

> **Cursor Prompt:**
>
> "Create a new 'Availability & Capacity' section in the venue dashboard at `/dashboard/availability`. Use a tabbed layout with 5 tabs: Services, Capacity Rules, Dining Duration, Booking Rules, and Closures.
>
> **TAB 1 — SERVICES:** Show cards for each `venue_service`. Each card displays: name (editable), active days as toggle chips (Mon-Sun), start time, end time, last booking time (time pickers), and an `is_active` toggle switch. Add an 'Add Service' button. Cards should be reorderable. Include a delete service button with confirmation modal ('This will not affect existing bookings but will stop new bookings for this service').
>
> **TAB 2 — CAPACITY RULES:** Select a service from a dropdown. Show the default rule: max covers per slot, max bookings per slot, slot interval (15/30/60 dropdown), and buffer/turn time (minutes input). Below defaults, show a grid: days of week as columns, timeslots (at the configured interval) as rows. Each cell is clickable to set an override value. Colour cells green (default), amber (reduced), red (closed). Add an 'Apply to all weekdays' and 'Apply to weekends' batch button. Every field should have a plain-English help text below it. Max covers help: 'The maximum number of guests that can start dining in any single X-minute window. A lower number creates a smoother service but reduces total capacity.' Buffer help: 'Minutes between one booking ending and the next starting at the same table. Accounts for clearing, cleaning, and resetting.'
>
> **TAB 3 — DINING DURATION:** A table per service showing party size ranges and duration in minutes, editable inline. Include a 'Reset to Defaults' button. Help text: 'This determines how long each booking occupies your capacity. Larger parties typically need more time.'
>
> **TAB 4 — BOOKING RULES:** Form fields for: min advance time (dropdown: 30min/1hr/2hr/4hr/same day), max advance days (number input), online party size min/max, large party threshold with custom message textarea, deposit settings per party size threshold. Help text for each field.
>
> **TAB 5 — CLOSURES:** Calendar view (month). Click a date to add a block: closure type (fully closed, specific service closed, reduced capacity), optional reason, optional override covers. Show existing blocks as coloured overlays on the calendar. Include a 'Recurring closure' option (e.g. closed every Monday).
>
> All tabs auto-save on change with a subtle success toast. Add a 'Preview Booking Page' button that opens the public page in a new tab so owners can immediately see how changes affect guest-facing availability."

### Prompt 13: Dashboard — Home Overview & Analytics

> **Cursor Prompt:**
>
> "Redesign the dashboard home page at `/dashboard` to give venue owners an at-a-glance understanding of their booking situation. Layout:
>
> (1) **TOP ROW — Today's summary cards:** 'Today's Covers' (number + % of capacity), 'Bookings Today' (count), 'Expected Revenue' (sum of deposits collected), 'Next Booking' (time + name + party size). Cards should use the venue's accent colour or a consistent design system colour.
>
> (2) **CAPACITY HEATMAP** — A visual weekly grid (current week Mon-Sun). Rows are timeslots at the venue's interval. Cells are colour-coded by fill rate: white (0%), green (<50%), amber (50-80%), red (>80%), dark red/filled (100%). Each cell shows 'X/Y' covers on hover or tap. This gives owners an instant visual of where they're busy vs. empty. Allow clicking forward/backward by week.
>
> (3) **7-DAY FORECAST BAR CHART** — Simple bar chart (use Recharts or similar) showing expected covers per day for the next 7 days. Overlay the venue's max daily capacity as a horizontal line.
>
> (4) **ACTIONABLE ALERTS PANEL** — A sidebar or bottom section with smart contextual alerts. Generate these server-side: 'Saturday dinner is 90% full', 'No bookings yet for Wednesday lunch — promote availability?', 'You have X unconfirmed bookings expiring soon', 'New cancellation: slot freed for [time]'. Limit to 5 most recent/important. Each alert should link to the relevant area (e.g. clicking a full-service alert goes to the capacity rules page).
>
> (5) **RECENT BOOKINGS LIST** — Keep the existing bookings list but enhance with: service name tag, party size, status colour coding (confirmed/pending/cancelled/completed), and a quick-action menu (view details, cancel, edit).
>
> Ensure the entire dashboard is fully responsive and loads efficiently — use React Server Components for the initial data and client components only for interactive elements."

### Prompt 14: Onboarding Wizard & Contextual Help

> **Cursor Prompt:**
>
> "Create a guided setup wizard for new venue onboarding that replaces the current manual configuration. The wizard should appear when a venue has no services configured yet (or via a 'Run Setup Wizard' button in settings).
>
> **STEP 1** — 'What type of venue are you?' — Cards to select from: Casual Dining, Fine Dining, Cafe/Bistro, Pub/Bar, Quick Service. This selection auto-populates smart defaults for everything that follows (e.g. Fine Dining: 120min duration, 30min intervals, 20min buffer; Casual: 75min, 15min intervals, 10min buffer).
>
> **STEP 2** — 'When are you open?' — Simple day/time selector. For each day of the week, toggle open/closed and set opening and closing times. Auto-detect common patterns (e.g. if Mon-Fri are same, offer 'Apply to all weekdays').
>
> **STEP 3** — 'Set up your services' — Based on opening hours, suggest services (e.g. if open 12-15 and 17-23, suggest 'Lunch' and 'Dinner'). Let owners rename and adjust times. Show a visual timeline.
>
> **STEP 4** — 'How many guests can you seat?' — Single number input for total covers. Then explain: 'We'll spread this across your booking windows to ensure a smooth service. You can fine-tune this later.' Auto-calculate `max_covers_per_slot` based on total covers, services, and interval.
>
> **STEP 5** — 'Deposit settings' — Reuse existing deposit configuration but frame it within the wizard context.
>
> **STEP 6** — 'Preview & Launch' — Show a preview of what the booking page will look like with the configured settings. Simulate a booking to demonstrate. 'Looks good? Let's go live!' button.
>
> Also add a contextual help system throughout the dashboard: every configuration field should have an (i) icon that shows a tooltip with a plain-English explanation and a worked example. Use a shared `HelpTooltip` component that takes a `helpKey` prop and renders consistently. Create a `helpContent.ts` file with all help strings centralised for easy editing."

### Prompt 15: Waitlist / Standby Feature

> **Cursor Prompt:**
>
> "Add a waitlist/standby feature for fully booked slots. Database: create a `waitlist_entries` table with: `id` (uuid PK), `venue_id`, `service_id`, `requested_date`, `requested_time`, `party_size`, `guest_name`, `guest_email`, `guest_phone`, `position` (int, auto-assigned), `status` (enum: waiting, notified, confirmed, expired, cancelled), `notified_at` (timestamptz nullable), `expires_at` (timestamptz nullable), `created_at`. Set a venue-level toggle `enable_waitlist` (boolean) on venues table. Cap waitlist entries at 50% of the slot's max covers.
>
> **Guest-facing:** when a slot is full on the booking page, show 'This time is fully booked' with a 'Join Standby List' button. Collect name, email, phone, and party size. Show current position ('You are #3 on the standby list'). Send a confirmation email/SMS: 'You've been added to the standby list for [venue] on [date] at [time]. We'll notify you if a spot opens up.'
>
> **Automation:** create a Supabase function or Vercel cron job that triggers when a booking is cancelled. It checks if there are waitlist entries for that slot, and if so, sends a notification to the first waiting entry via email and SMS: 'Great news! A table has opened up at [venue] for [date] at [time]. Click here to confirm your booking within 30 minutes.' Set `expires_at` to now + 30 minutes. If they don't confirm in time, move to the next person.
>
> **Dashboard:** add a 'Standby List' tab to the bookings view showing all current waitlist entries with their status, and an option to manually promote someone from the waitlist."

---

## 5. Implementation Sequence & Dependencies

The prompts should be executed in order as each builds on the previous. Here is the recommended sequence with estimated effort:

| Prompt | Description | Layer | Effort | Depends On |
|---|---|---|---|---|
| 8 | Database Schema: Services & Capacity | Backend | Medium | Prompts 1-7 |
| 9 | Availability Calculation Engine | Backend | High | Prompt 8 |
| 10 | Booking Flow Integration | Backend + API | Medium | Prompt 9 |
| 11 | Guest Booking Page Frontend | Frontend | Medium | Prompt 10 |
| 12 | Dashboard Availability Settings Hub | Frontend + API | High | Prompt 8 |
| 13 | Dashboard Home Overview & Analytics | Frontend + API | High | Prompt 9 |
| 14 | Onboarding Wizard & Help System | Frontend | Medium | Prompt 12 |
| 15 | Waitlist / Standby Feature | Full Stack | Medium | Prompt 10 |

**Note:** Prompts 12 and 13 (dashboard work) can be started in parallel with Prompts 10 and 11 (booking flow) since they share the same schema from Prompt 8 but operate on different pages. The critical path is: 8 → 9 → 10 → 11 for the guest-facing flow, and 8 → 12 → 14 for the dashboard.

---

## 6. Testing Strategy

Each prompt should include testing instructions. Key test scenarios for the availability engine:

### Core Engine Tests

1. **Basic availability:** venue with 60 covers, 15-min intervals, no bookings → all slots show 60 covers remaining.
2. **Single booking impact:** book 4 covers at 19:00 with 90-min duration and 15-min buffer → slots 19:00 through 20:30 lose 4 covers, 20:45 does not.
3. **Slot fills up:** `max_covers_per_slot` = 12, book three parties of 4 → slot shows full.
4. **Bookings limit:** `max_bookings_per_slot` = 5, book 5 parties of 2 (10 covers, under cover limit) → slot unavailable due to booking count.
5. **Day-of-week override:** Friday has 8 max covers/slot instead of 12 → correctly applies.
6. **Time-range override:** 19:00-20:00 reduced to 6 covers/slot → correctly applies only in that window.
7. **Closure block:** date is blocked → no slots returned.
8. **Advance booking limits:** booking for tomorrow when `min_advance` = 48 hours → rejected.
9. **Large party redirect:** party of 10 when threshold = 8 → returns redirect message.
10. **Race condition:** two simultaneous booking attempts for the last available slot → one succeeds, one gets 409.

### Dashboard Tests

1. Creating a new service with custom capacity rules → reflected in booking page.
2. Changing duration rules → new bookings get updated `estimated_end_time`.
3. Adding a closure → booking page shows no availability for that date/service.
4. Heatmap accuracy: book 10 of 12 covers at 19:00 on Friday → cell shows red.
5. Alerts generate correctly for high-capacity and empty services.

---

## 7. How This Positions ReserveNI Competitively

With these improvements, ReserveNI would offer an availability engine that matches or exceeds what most independent restaurants get from paid platforms like ResDiary (from £89/month) and Tablein, while maintaining the zero-commission, deposit-focused model that differentiates the platform.

**vs. ResDiary** — ReserveNI would match their core yield management (covers + bookings per slot, day/time overrides, party-size durations), their service-period model, and their closure management. ReserveNI would not yet have table-level management or POS integration, but these are not priorities for the target market of independent NI restaurants.

**vs. OpenTable** — ReserveNI would lack the marketplace/diner network (which is also OpenTable's cost centre for restaurants via per-cover fees). However, the availability engine itself would be comparable for the use case of managing a single venue's online bookings with proper capacity control.

**vs. Tablein / Table Agent** — ReserveNI would significantly exceed these simpler platforms by having yield management, service periods, and the contextual dashboard with heatmaps and alerts.

**Key Differentiator** — The combination of a sophisticated availability engine with a genuinely helpful dashboard (heatmaps, alerts, onboarding wizard) targeted specifically at independent NI restaurants creates a strong position. The guided setup and contextual help lower the barrier for non-technical restaurant owners, which is where many platforms fail — they have the features but they are too complex to configure without training.

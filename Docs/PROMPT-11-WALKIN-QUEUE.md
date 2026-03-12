# Prompt 11: Walk-In Queue & Virtual Waitlist

## Context

ReserveNI is a Next.js / Supabase / Stripe Connect / Twilio / SendGrid platform for independent restaurants in Northern Ireland. Prompts 1–10 delivered the core MVP: hosted booking pages, deposit collection, reservations dashboard, day sheet, communications engine, and reporting.

This prompt adds **walk-in queue management** and a **customer-facing virtual waitlist** — the ability for restaurants to add walk-ins to a digital queue, estimate wait times, and notify customers via SMS when their table is ready. Customers can also self-join the queue via a public link or QR code, see their real-time position, and receive text prompts throughout their wait.

### Competitive Landscape Summary

The market leaders (Waitwhile, NextMe, TablesReady, OpenTable, Yelp Guest Manager) all share a common feature set: SMS notifications, estimated wait times, QR code self-check-in, and a staff dashboard. Where they fall short — and where ReserveNI can differentiate — is:

1. **Unified reservations + walk-ins in one stream.** Most tools are either reservation-first (OpenTable) or waitlist-first (NextMe). ReserveNI already has a reservations dashboard — the queue merges seamlessly into it.
2. **No app download, no account required for guests.** Token-based URLs (already the ReserveNI pattern) mean zero friction.
3. **Deposit-aware queue.** No competitor lets a restaurant optionally request a deposit from a walk-in queuer to lock their spot — ReserveNI already has Stripe Connect deposits built in.
4. **Intelligent wait estimates tied to real table data.** Most competitors show a host's manual guess. ReserveNI can calculate estimates from actual reservation end times and current seated parties.
5. **Two-way SMS built in.** Twilio is already integrated — guests can reply to confirm, cancel, or say they're running late.

### Design Philosophy

The queue experience should feel like magic for both sides:
- **For the customer:** Join in 10 seconds. See your position update in real time. Get a friendly text when it's almost your turn, and another when your table is ready. Never wonder "did they forget about me?"
- **For the restaurant:** One tap to add a walk-in. Glanceable queue on the same screen as reservations. One tap to notify. Smart estimates that learn from your actual table turn times.

---

## Phase 1: Database Schema

### New Tables

```sql
-- ============================================================
-- 1. queue_entries: The core walk-in queue
-- ============================================================
CREATE TABLE queue_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,

  -- Guest info (no login required)
  guest_name TEXT NOT NULL,
  guest_phone TEXT NOT NULL,           -- E.164 format
  guest_email TEXT,                     -- Optional
  party_size INTEGER NOT NULL DEFAULT 2 CHECK (party_size >= 1 AND party_size <= 20),
  guest_notes TEXT,                     -- "High chair needed", "birthday", etc.

  -- Queue state
  status TEXT NOT NULL DEFAULT 'waiting'
    CHECK (status IN ('waiting', 'notified', 'seated', 'no_show', 'cancelled', 'expired')),
  position INTEGER,                    -- Current position in queue (nullable, computed)
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal', 'vip', 'callback')),

  -- Timing
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  estimated_wait_minutes INTEGER,      -- Calculated estimate shown to guest
  quoted_wait_minutes INTEGER,         -- What the host verbally quoted (if different)
  notified_at TIMESTAMPTZ,             -- When "table ready" SMS was sent
  seated_at TIMESTAMPTZ,               -- When actually seated
  cancelled_at TIMESTAMPTZ,
  expired_at TIMESTAMPTZ,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'host'
    CHECK (source IN ('host', 'qr_code', 'web_link', 'booking_page')),

  -- Token for guest-facing status page (like existing reservation tokens)
  guest_token TEXT NOT NULL DEFAULT encode(gen_random_bytes(16), 'hex'),

  -- Optional: link to a reservation if walk-in converts to booking
  reservation_id UUID REFERENCES reservations(id),

  -- Deposit (optional — venue can require deposit to hold queue spot)
  deposit_requested BOOLEAN NOT NULL DEFAULT false,
  deposit_amount_cents INTEGER,
  deposit_status TEXT DEFAULT 'none'
    CHECK (deposit_status IN ('none', 'pending', 'paid', 'refunded')),
  stripe_payment_intent_id TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_queue_entries_venue_status ON queue_entries(venue_id, status);
CREATE INDEX idx_queue_entries_venue_joined ON queue_entries(venue_id, joined_at);
CREATE INDEX idx_queue_entries_guest_token ON queue_entries(guest_token);
CREATE INDEX idx_queue_entries_guest_phone ON queue_entries(guest_phone);

-- ============================================================
-- 2. queue_settings: Per-venue queue configuration
-- ============================================================
CREATE TABLE queue_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL UNIQUE REFERENCES venues(id) ON DELETE CASCADE,

  -- Feature toggles
  queue_enabled BOOLEAN NOT NULL DEFAULT false,
  self_join_enabled BOOLEAN NOT NULL DEFAULT true,       -- Allow guests to self-add via QR/link
  deposit_required_for_queue BOOLEAN NOT NULL DEFAULT false,
  deposit_amount_cents INTEGER DEFAULT 500,              -- Default £5

  -- Queue behavior
  max_queue_size INTEGER DEFAULT 30,                     -- Max simultaneous waiters (null = unlimited)
  max_party_size INTEGER DEFAULT 10,                     -- Largest party that can join queue
  auto_expire_minutes INTEGER DEFAULT 60,                -- Auto-expire entries after N minutes of no response
  notify_when_parties_ahead INTEGER DEFAULT 2,           -- Send "almost your turn" SMS when N parties ahead

  -- Wait time estimation
  default_turn_time_minutes INTEGER DEFAULT 75,          -- Fallback avg meal duration if no data
  use_smart_estimates BOOLEAN NOT NULL DEFAULT true,     -- Use actual table data for estimates

  -- Operating hours for queue (null = same as venue hours)
  queue_open_time TIME,
  queue_close_time TIME,
  queue_days_active INTEGER[] DEFAULT '{0,1,2,3,4,5,6}', -- 0=Sunday

  -- SMS templates (use {{variables}})
  sms_joined_template TEXT DEFAULT 'Hi {{guest_name}}! You''re on the waitlist at {{venue_name}}. Position: #{{position}} | Est. wait: {{estimated_wait}} mins. Track your spot: {{status_url}}',
  sms_almost_ready_template TEXT DEFAULT 'Almost time, {{guest_name}}! You''re next in line at {{venue_name}}. Please head towards the restaurant. {{status_url}}',
  sms_table_ready_template TEXT DEFAULT 'Your table is ready at {{venue_name}}, {{guest_name}}! Please come to the host stand now. Reply YES to confirm or CANCEL to leave the queue.',
  sms_no_show_template TEXT DEFAULT 'Hi {{guest_name}}, we tried to seat you at {{venue_name}} but couldn''t reach you. Your spot has been released. Feel free to rejoin: {{join_url}}',

  -- Branding for guest-facing queue page
  queue_page_heading TEXT DEFAULT 'Join Our Waitlist',
  queue_page_description TEXT,
  show_position_to_guests BOOLEAN NOT NULL DEFAULT true,
  show_estimated_wait_to_guests BOOLEAN NOT NULL DEFAULT true,
  show_parties_ahead_to_guests BOOLEAN NOT NULL DEFAULT true,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============================================================
-- 3. queue_activity_log: Audit trail for queue actions
-- ============================================================
CREATE TABLE queue_activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_entry_id UUID NOT NULL REFERENCES queue_entries(id) ON DELETE CASCADE,
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  action TEXT NOT NULL
    CHECK (action IN (
      'joined', 'position_updated', 'notified_almost_ready',
      'notified_table_ready', 'guest_confirmed', 'guest_cancelled',
      'seated', 'no_show', 'expired', 'priority_changed',
      'deposit_requested', 'deposit_paid', 'moved_up', 'moved_down',
      'note_added', 'sms_sent', 'sms_received'
    )),
  details JSONB,                       -- Flexible payload (e.g., SMS content, old/new position)
  performed_by TEXT,                   -- 'system', 'host', or staff user ID
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_queue_activity_venue ON queue_activity_log(venue_id, created_at);
CREATE INDEX idx_queue_activity_entry ON queue_activity_log(queue_entry_id);

-- ============================================================
-- 4. table_turn_history: Track actual table durations for smart estimates
-- ============================================================
CREATE TABLE table_turn_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  party_size INTEGER NOT NULL,
  seated_at TIMESTAMPTZ NOT NULL,
  cleared_at TIMESTAMPTZ NOT NULL,
  duration_minutes INTEGER NOT NULL,   -- Computed: cleared_at - seated_at
  day_of_week INTEGER NOT NULL,        -- 0-6
  meal_period TEXT,                     -- 'lunch', 'dinner', 'brunch' etc.
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_table_turns_venue ON table_turn_history(venue_id, day_of_week, meal_period);
```

### Schema Modifications to Existing Tables

```sql
-- Add queue-related fields to venues table
ALTER TABLE venues ADD COLUMN IF NOT EXISTS queue_qr_code_url TEXT;
ALTER TABLE venues ADD COLUMN IF NOT EXISTS queue_page_slug TEXT UNIQUE;

-- Add to reservations for tracking walk-in conversions
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS source_queue_entry_id UUID REFERENCES queue_entries(id);
```

### Row-Level Security (RLS)

```sql
-- queue_entries: venue staff can CRUD, guests can read their own via token
ALTER TABLE queue_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_staff_queue" ON queue_entries
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM venue_staff WHERE user_id = auth.uid())
  );

CREATE POLICY "guest_view_own_queue" ON queue_entries
  FOR SELECT USING (
    guest_token = current_setting('request.headers')::json->>'x-guest-token'
  );

-- queue_settings: venue staff only
ALTER TABLE queue_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_staff_queue_settings" ON queue_settings
  FOR ALL USING (
    venue_id IN (SELECT venue_id FROM venue_staff WHERE user_id = auth.uid())
  );

-- queue_activity_log: venue staff read-only, system writes
ALTER TABLE queue_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "venue_staff_activity_log" ON queue_activity_log
  FOR SELECT USING (
    venue_id IN (SELECT venue_id FROM venue_staff WHERE user_id = auth.uid())
  );
```

### Supabase Realtime

Enable realtime on `queue_entries` for live dashboard and guest status pages:

```sql
ALTER PUBLICATION supabase_realtime ADD TABLE queue_entries;
```

---

## Phase 2: Wait Time Estimation Engine

This is the key differentiator. Instead of the host guessing "about 30 minutes", ReserveNI calculates estimates from actual data.

### File: `lib/queue/estimate-wait.ts`

```typescript
interface WaitEstimateInput {
  venueId: string;
  partySize: number;
  currentPosition: number; // 1-based position in queue
}

interface WaitEstimateResult {
  estimatedMinutes: number;
  confidence: 'high' | 'medium' | 'low';
  method: 'table_data' | 'historical_avg' | 'default';
  nextAvailableSlot?: Date;
}

/**
 * Smart wait time estimation algorithm:
 *
 * 1. Look at currently seated parties — when are they expected to finish?
 *    - Use reservation end times for booked tables
 *    - Use avg turn time + seated_at for walk-ins
 *
 * 2. Factor in party size — a party of 6 can only sit at tables that
 *    fit 6+, so their wait may be longer than a couple.
 *
 * 3. Use historical table_turn_history for this venue, day of week,
 *    and meal period to get realistic averages.
 *
 * 4. Account for parties ahead in queue — each waiting party ahead
 *    will take a table before this guest.
 *
 * 5. Fallback: if no data, use queue_settings.default_turn_time_minutes.
 */
export async function estimateWaitTime(
  supabase: SupabaseClient,
  input: WaitEstimateInput
): Promise<WaitEstimateResult> {
  // Implementation steps:
  //
  // Step 1: Get venue's queue settings
  // Step 2: Get currently seated parties count + their expected end times
  //   - From reservations table: end_time for current bookings
  //   - From queue_entries where status='seated': seated_at + avg_turn_time
  // Step 3: Get historical average turn time for this day/meal period
  //   - Query table_turn_history for venue, filter by day_of_week and party_size range
  //   - Use weighted average (more recent data weighted higher)
  // Step 4: Count parties ahead in queue with compatible party sizes
  // Step 5: Calculate estimate
  //   - Find earliest expected table clearance
  //   - For each party ahead, add one turn duration
  //   - Return estimated minutes with confidence level
  //
  // Confidence levels:
  //   high: 50+ data points in table_turn_history for this config
  //   medium: 10-49 data points
  //   low: fewer than 10 data points, using defaults
}
```

### Periodic Recalculation

Create a function that recalculates estimates for all waiting entries every 5 minutes (called via Supabase cron or client-side polling):

```typescript
// lib/queue/recalculate-positions.ts
export async function recalculateQueuePositions(venueId: string) {
  // 1. Get all 'waiting' entries ordered by joined_at, priority
  //    VIP entries sort above normal at their original position
  // 2. Assign position 1, 2, 3...
  // 3. Recalculate estimated_wait_minutes for each
  // 4. Update all entries in a single transaction
  // 5. Trigger 'almost ready' SMS if position <= notify_when_parties_ahead
}
```

---

## Phase 3: API Routes

### Queue Management (Staff)

```
POST   /api/venues/[venueId]/queue              — Add walk-in to queue
GET    /api/venues/[venueId]/queue              — Get current queue (with realtime sub)
PATCH  /api/venues/[venueId]/queue/[entryId]    — Update entry (status, priority, notes)
DELETE /api/venues/[venueId]/queue/[entryId]    — Remove from queue
POST   /api/venues/[venueId]/queue/[entryId]/notify   — Send "table ready" SMS
POST   /api/venues/[venueId]/queue/[entryId]/seat     — Mark as seated (creates reservation if needed)
POST   /api/venues/[venueId]/queue/reorder      — Bulk reorder (drag-and-drop)
GET    /api/venues/[venueId]/queue/settings      — Get queue settings
PUT    /api/venues/[venueId]/queue/settings      — Update queue settings
```

### Guest Self-Service (Public, No Auth)

```
GET    /api/queue/[venueId]/join-info           — Get venue queue info (is it open, current wait, etc.)
POST   /api/queue/[venueId]/join                — Self-join the queue
GET    /api/queue/status/[guestToken]           — Get guest's queue status (position, estimate)
POST   /api/queue/status/[guestToken]/cancel    — Guest self-cancels
```

### Twilio Webhook (Inbound SMS)

```
POST   /api/webhooks/twilio/queue-reply         — Handle guest SMS replies (YES, CANCEL, LATE)
```

### API Route Implementation Details

#### `POST /api/venues/[venueId]/queue` — Add Walk-In

```typescript
// Request body
{
  guest_name: string;
  guest_phone: string;       // Will be normalized to E.164
  guest_email?: string;
  party_size: number;
  guest_notes?: string;
  source: 'host' | 'qr_code' | 'web_link' | 'booking_page';
  priority?: 'normal' | 'vip';
}

// Logic:
// 1. Validate venue has queue_enabled
// 2. Check max_queue_size not exceeded
// 3. Check party_size <= max_party_size
// 4. Normalize phone number to E.164 (UK format)
// 5. Create queue_entry with status='waiting'
// 6. Calculate position and estimated_wait_minutes
// 7. Send SMS with joined confirmation + status page link
// 8. Log activity: 'joined'
// 9. Return entry with token

// Response
{
  id: string;
  position: number;
  estimated_wait_minutes: number;
  guest_token: string;
  status_url: string;
}
```

#### `POST /api/venues/[venueId]/queue/[entryId]/notify` — Table Ready

```typescript
// Logic:
// 1. Update status to 'notified', set notified_at
// 2. Send SMS using sms_table_ready_template
// 3. Start auto-expire timer (auto_expire_minutes from settings)
// 4. Log activity: 'notified_table_ready'
// 5. If no response after expiry, mark as 'no_show' and send sms_no_show_template
```

#### `POST /api/venues/[venueId]/queue/[entryId]/seat` — Mark Seated

```typescript
// Logic:
// 1. Update status to 'seated', set seated_at
// 2. Recalculate positions for all remaining entries
// 3. Optionally create a reservation record (for day sheet integration)
// 4. Log activity: 'seated'
// 5. Trigger wait estimate recalculation for remaining queue
```

#### `POST /api/webhooks/twilio/queue-reply` — Inbound SMS Handler

```typescript
// Parse incoming SMS body from Twilio webhook
// Match phone number to active queue_entry
// Handle keywords:
//   YES / CONFIRM / Y → Log 'guest_confirmed', update activity
//   CANCEL / NO / N   → Set status='cancelled', recalculate positions, log
//   LATE / RUNNING LATE → Log note, optionally move down 1-2 positions
//   Any other text     → Forward to venue dashboard as a message, log 'sms_received'
```

---

## Phase 4: Staff Dashboard — Queue Panel

### Location: `app/(dashboard)/venues/[venueId]/queue/page.tsx`

The queue panel should be accessible from the main dashboard sidebar and also embedded as a tab/panel alongside the existing reservations view.

### Queue Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│  [Reservations]  [Queue (5)]  [Day Sheet]                   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─ Quick Add ──────────────────────────────────────────┐   │
│  │ Name: [________] Phone: [________] Party: [2▾] [Add] │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                             │
│  Queue (5 waiting · ~25 min avg wait)                       │
│  ─────────────────────────────────────────────                │
│                                                             │
│  1. ★ Sarah M. — Party of 4 — 12 min wait                  │
│     📱 +44 7700 900123 · VIP · "Anniversary dinner"         │
│     [Notify ▸] [Seat ▸] [···]                               │
│                                                             │
│  2.   James K. — Party of 2 — 18 min wait                  │
│     📱 +44 7700 900456 · Joined via QR code                 │
│     [Notify ▸] [Seat ▸] [···]                               │
│                                                             │
│  3.   Chen W. — Party of 6 — 30 min wait                   │
│     📱 +44 7700 900789 · "Needs wheelchair access"          │
│     [Notify ▸] [Seat ▸] [···]                               │
│                                                             │
│  ─── Notified ───────────────────────────────                │
│                                                             │
│  ⏳ Alex T. — Party of 2 — Notified 3 min ago               │
│     Awaiting response... [Seat ▸] [No Show ▸] [···]         │
│                                                             │
│  ─── Seated Today ───────────────────────────                │
│                                                             │
│  ✓ Maria P. — Party of 3 — Waited 15 min · Seated 7:22 PM  │
│  ✓ Tom B. — Party of 2 — Waited 8 min · Seated 7:10 PM     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key UI Requirements

1. **Real-time updates:** Use Supabase Realtime subscription on `queue_entries` filtered by `venue_id`. The list should update live without refresh.

2. **Drag-and-drop reorder:** Allow staff to drag entries to reorder the queue. On drop, call `POST /queue/reorder` with new positions. Use `@dnd-kit/sortable` or similar.

3. **Quick Add form:** Inline form at the top. Name + Phone + Party Size + optional notes. Single tap to add. Phone input should auto-format for UK numbers.

4. **One-tap actions:**
   - **Notify** → Sends "table ready" SMS, moves to "Notified" section
   - **Seat** → Marks seated, moves to "Seated Today" section, recalculates queue
   - **Overflow menu (···)** → Edit details, Change priority, Move up/down, Remove, View SMS history

5. **Status sections:** The queue view is divided into three collapsible sections:
   - **Waiting** (ordered by position)
   - **Notified** (ordered by notified_at, with elapsed timer)
   - **Seated Today** (reverse chronological, collapsed by default)

6. **Visual indicators:**
   - Star icon for VIP priority
   - Source badge (QR, Web, Host-added)
   - Colour-coded wait time (green < 15min, amber 15-30, red 30+)
   - Pulsing indicator for notified entries awaiting response
   - Party size prominently displayed

7. **Queue stats bar:** At the top of the queue panel, show:
   - Current queue length
   - Average wait time
   - Longest current wait
   - Guests seated today from queue

8. **Sound notification:** Play a subtle chime when a guest replies to an SMS (confirmed, cancelled, or other message). Use the Web Audio API.

---

## Phase 5: Guest-Facing Queue Status Page

### Location: `app/(public)/queue/[venueId]/page.tsx` (Join page)
### Location: `app/(public)/queue/status/[guestToken]/page.tsx` (Status page)

### 5a. Join Page

This page is accessible via QR code at the restaurant or via a link on the venue's booking page. It should be mobile-first, fast, and require no login.

```
┌─────────────────────────────┐
│     [Venue Logo]            │
│                             │
│   Join the Waitlist at      │
│   The Oak & Ember           │
│                             │
│   Current wait: ~20 mins    │
│   3 parties ahead of you    │
│                             │
│   ─────────────────────     │
│                             │
│   Your Name                 │
│   [____________________]    │
│                             │
│   Mobile Number             │
│   [+44 _______________]     │
│                             │
│   Party Size                │
│   [ 1 ][ 2 ][ 3 ][ 4 ]     │
│   [ 5 ][ 6 ][ 7 ][ 8+ ]   │
│                             │
│   Any special requirements? │
│   [____________________]    │
│                             │
│   [ Join Waitlist →  ]      │
│                             │
│   By joining you agree to   │
│   receive SMS updates.      │
│                             │
└─────────────────────────────┘
```

**Key requirements:**
- Show live queue info (current wait, parties ahead) before the form
- Party size selector should be tappable buttons, not a dropdown
- Phone input defaults to +44 UK prefix
- Optional special requirements field
- Single action button — no account creation
- If queue is full or closed, show a clear message with venue phone number
- Venue branding (logo, colours) from venue settings
- If `deposit_required_for_queue` is enabled, show deposit info and redirect to Stripe Checkout after form submission

### 5b. Status Page (Post-Join)

After joining, the guest is redirected here and also receives this URL via SMS. This page uses Supabase Realtime to update live.

```
┌─────────────────────────────┐
│     [Venue Logo]            │
│                             │
│   You're on the list!       │
│   ─────────────────────     │
│                             │
│      ┌──────────────┐       │
│      │              │       │
│      │    #  3      │       │
│      │              │       │
│      │  Your spot   │       │
│      └──────────────┘       │
│                             │
│   Estimated wait            │
│   ≈ 18 minutes              │
│                             │
│   2 parties ahead of you    │
│                             │
│   ● ● ● ○ ○ ○ ○ ○          │
│   ▲ You are here            │
│                             │
│   ─────────────────────     │
│                             │
│   We'll text you at         │
│   +44 7700 ●●● 123         │
│   when your table is ready  │
│                             │
│   ─────────────────────     │
│                             │
│   [ Cancel My Spot ]        │
│                             │
│   Joined at 7:15 PM         │
│   Party of 4 · Sarah M.    │
│                             │
└─────────────────────────────┘
```

**Key requirements:**
- **Real-time position updates** via Supabase Realtime subscription on the specific `queue_entry` row
- **Progress visualization:** A simple dot/step indicator showing position in queue. Updates live as parties ahead are seated.
- **Large, clear position number** — the most important info
- **Estimated wait in minutes** — updates as recalculation runs
- **Masked phone number** for privacy
- **Cancel button** — confirms with a dialog before cancelling
- **State transitions:**
  - `waiting` → Show position + estimate + progress dots
  - `notified` → Big animated "Your table is ready!" state with instructions
  - `seated` → "Enjoy your meal!" confirmation
  - `no_show` → "We missed you" with option to rejoin
  - `cancelled` → "You've left the waitlist" with option to rejoin
  - `expired` → "Your spot expired" with option to rejoin

**"Table Ready" state — this is the money moment:**

```
┌─────────────────────────────┐
│     [Venue Logo]            │
│                             │
│   ┌─────────────────────┐   │
│   │                     │   │
│   │  🎉 Your table      │   │
│   │     is ready!       │   │
│   │                     │   │
│   └─────────────────────┘   │
│                             │
│   Please head to the        │
│   host stand now.           │
│                             │
│   [ I'm On My Way → ]      │
│                             │
│   Can't make it?            │
│   [ Cancel My Spot ]        │
│                             │
└─────────────────────────────┘
```

---

## Phase 6: SMS Communication Flows

### Message Templates (Using Existing SendGrid/Twilio Infrastructure)

All SMS is sent via Twilio (already integrated). Use the existing `lib/communications/` patterns.

### Flow 1: Host Adds Walk-In

```
[Host adds "Sarah, party of 4" to queue]
    ↓
SMS → Sarah: "Hi Sarah! You're on the waitlist at The Oak & Ember.
Position: #3 | Est. wait: ~20 mins.
Track your spot: https://reserveni.com/queue/status/abc123"
    ↓
[Position updates as others are seated — no SMS for position changes,
 guest sees live updates on status page]
    ↓
[Position reaches notify_when_parties_ahead threshold (default: 2)]
SMS → Sarah: "Almost time, Sarah! You're next in line at The Oak & Ember.
Please head towards the restaurant. https://reserveni.com/queue/status/abc123"
    ↓
[Host taps "Notify" when table is actually ready]
SMS → Sarah: "Your table is ready at The Oak & Ember, Sarah!
Please come to the host stand now.
Reply YES to confirm or CANCEL to leave the queue."
    ↓
Sarah replies "YES"
    ↓
[Dashboard shows confirmed. Host taps "Seat".]
    ↓
[Entry moves to seated. Queue recalculates.]
```

### Flow 2: Guest Self-Joins via QR Code

```
[Guest scans QR code at restaurant entrance]
    ↓
[Lands on Join Page → fills in name, phone, party size]
    ↓
[Queue entry created → redirected to Status Page]
    ↓
SMS → Guest: "You're on the waitlist at The Oak & Ember!
Position: #5 | Est. wait: ~30 mins.
Track your spot: https://reserveni.com/queue/status/def456"
    ↓
[Same flow as above from here]
```

### Flow 3: No-Show Handling

```
[Host taps "Notify" → SMS sent]
    ↓
[auto_expire_minutes timer starts (default: 10 min for notified state)]
    ↓
[No response after expiry]
    ↓
SMS → Guest: "Hi Sarah, we tried to seat you at The Oak & Ember
but couldn't reach you. Your spot has been released.
Feel free to rejoin: https://reserveni.com/queue/oak-ember/join"
    ↓
[Status changes to 'no_show'. Queue recalculates.]
```

### Flow 4: Guest Replies "LATE"

```
SMS ← Guest: "Running late, 10 mins"
    ↓
[Webhook receives message, matches to queue entry]
    ↓
[Adds note to entry, optionally moves down 1-2 positions]
    ↓
[Dashboard shows message inline on the entry with a "late" badge]
    ↓
SMS → Guest: "No worries! We've noted you're running late.
We'll hold your spot — just let us know if plans change."
```

---

## Phase 7: Queue Settings UI

### Location: `app/(dashboard)/venues/[venueId]/settings/queue/page.tsx`

Add a "Waitlist" section to the venue settings page with these configurable options:

**General:**
- Enable/disable virtual queue (toggle)
- Allow self-join via QR code / web link (toggle)
- Maximum queue size
- Maximum party size for queue
- Auto-expire time after notification (minutes)
- "Almost ready" notification threshold (parties ahead)

**Wait Time Estimation:**
- Default table turn time (minutes) — fallback when no historical data
- Use smart estimates (toggle) — if off, always uses default
- Override: manual wait time quote (lets host type a number instead of auto-calc)

**Queue Hours:**
- Use same hours as venue (toggle)
- Custom queue open/close times per day

**SMS Templates:**
- Editable templates for each message type
- Variable reference: `{{guest_name}}`, `{{venue_name}}`, `{{position}}`, `{{estimated_wait}}`, `{{status_url}}`, `{{join_url}}`
- Preview/test send button

**Deposit Settings:**
- Require deposit to join queue (toggle)
- Deposit amount (£)
- Auto-refund on seating (toggle)

**Guest Page Branding:**
- Queue page heading text
- Description text
- Show/hide: position, estimated wait, parties ahead (toggles)

**QR Code:**
- Generate and download QR code for the venue's queue join page
- QR code links to: `https://reserveni.com/queue/[venueSlug]/join`
- Download as PNG (for printing table tents, door signs, etc.)

---

## Phase 8: Integration with Existing Features

### 8a. Reservations Dashboard Integration

The queue should appear as a tab or side panel on the existing reservations dashboard. When a queue entry is "Seated", it can optionally create a reservation record so it appears on the day sheet and in reporting.

```typescript
// When seating a queue entry, optionally create a reservation:
async function seatQueueEntry(entryId: string, createReservation: boolean) {
  const entry = await getQueueEntry(entryId);

  // Update queue entry
  await updateQueueEntry(entryId, {
    status: 'seated',
    seated_at: new Date(),
  });

  if (createReservation) {
    // Create a reservation record for day sheet / reporting
    await createReservation({
      venue_id: entry.venue_id,
      guest_name: entry.guest_name,
      guest_phone: entry.guest_phone,
      guest_email: entry.guest_email,
      party_size: entry.party_size,
      date: new Date(),
      time: new Date(),
      status: 'seated',
      source: 'walk_in_queue',
      source_queue_entry_id: entry.id,
      notes: entry.guest_notes,
    });
  }

  // Record table turn start (for smart estimates)
  // This will be completed when the party leaves

  // Recalculate remaining queue
  await recalculateQueuePositions(entry.venue_id);
}
```

### 8b. Day Sheet Integration

Walk-ins seated from the queue should appear on the day sheet with a "Walk-in" badge, distinct from advance reservations. They flow into the same view but are visually differentiated.

### 8c. Reporting Integration

Add queue metrics to the existing reporting/reconciliation views:

- **Queue volume:** Total walk-ins per day/week/month
- **Conversion rate:** % of queue entries that were seated (vs. no-show/cancelled)
- **Average wait time:** Actual vs. estimated
- **Peak queue times:** Heat map of busiest queue hours
- **No-show rate:** From queue specifically
- **Self-join rate:** What % joined via QR/web vs. host-added
- **SMS engagement:** Reply rate to table-ready notifications

### 8d. Booking Page Integration

On the venue's existing hosted booking page, if the queue is enabled and active:
- Show a "Join the Waitlist" option when no reservation slots are available
- Show current estimated wait time
- Allow guests to join the queue directly from the booking page (source: 'booking_page')

---

## Phase 9: Realtime Implementation

### Supabase Realtime Setup

```typescript
// hooks/useQueueRealtime.ts
import { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';

export function useQueueRealtime(venueId: string) {
  const [queueEntries, setQueueEntries] = useState<QueueEntry[]>([]);

  useEffect(() => {
    // Initial fetch
    fetchQueue(venueId).then(setQueueEntries);

    // Subscribe to changes
    const channel = supabase
      .channel(`queue:${venueId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'queue_entries',
          filter: `venue_id=eq.${venueId}`,
        },
        (payload) => {
          // Handle INSERT, UPDATE, DELETE
          // Update local state optimistically
          handleQueueChange(payload, setQueueEntries);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [venueId]);

  return queueEntries;
}

// For guest status page — subscribe to single entry
export function useGuestQueueStatus(guestToken: string) {
  const [entry, setEntry] = useState<QueueEntry | null>(null);

  useEffect(() => {
    // Initial fetch via public API
    fetchGuestStatus(guestToken).then(setEntry);

    // Subscribe via Supabase Realtime (using Broadcast for public access)
    const channel = supabase
      .channel(`guest:${guestToken}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'queue_entries',
          filter: `guest_token=eq.${guestToken}`,
        },
        (payload) => {
          setEntry(payload.new as QueueEntry);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [guestToken]);

  return entry;
}
```

### Note on Realtime Access for Guest Pages

Guest status pages are public (no auth). For the Realtime subscription, either:

**Option A (Recommended):** Use Supabase Realtime with an anon key and an RLS policy that allows `SELECT` on `queue_entries` filtered by `guest_token`. The guest page passes the token as a filter.

**Option B:** Use polling as a fallback — fetch the status API every 10 seconds. Less elegant but simpler if Realtime RLS setup is complex.

**Option C:** Use Supabase Broadcast from the server side — when a queue entry updates, broadcast to a channel named after the guest token. The guest page subscribes to that channel. No RLS needed for Broadcast.

Recommend starting with **Option A** and falling back to **Option B** if Realtime performance is a concern on the free tier.

---

## Phase 10: Auto-Expiry & Background Jobs

### Supabase Edge Function or Cron: `queue-maintenance`

Run every 2 minutes via Supabase cron (`pg_cron`) or a Vercel cron route:

```typescript
// api/cron/queue-maintenance/route.ts
// Triggered by Vercel cron: every 2 minutes

export async function GET(request: Request) {
  // Verify cron secret header

  // 1. Expire stale "notified" entries
  //    If notified_at + auto_expire_minutes < now() → set status='no_show'
  //    Send no-show SMS
  //    Recalculate positions

  // 2. Expire stale "waiting" entries
  //    If joined_at + (auto_expire_minutes * 3) < now() → set status='expired'
  //    Send expiry SMS with rejoin link

  // 3. Recalculate all active queue positions and estimates
  //    For each venue with active queue entries, run recalculateQueuePositions()

  // 4. Record table turns
  //    Check for reservations/queue entries that have been seated for longer
  //    than expected — these may have cleared. (Manual "clear table" is better,
  //    but auto-detect provides fallback data for estimates.)

  return Response.json({ ok: true });
}
```

### Vercel Cron Configuration

```json
// vercel.json
{
  "crons": [
    {
      "path": "/api/cron/queue-maintenance",
      "schedule": "*/2 * * * *"
    }
  ]
}
```

---

## Implementation Order

Build in this sequence — each step is independently deployable and testable:

### Step 1: Schema & Settings (1–2 sessions)
- Run all migration SQL
- Create `queue_settings` CRUD API + settings UI page
- Seed default settings when venue enables queue

### Step 2: Core Queue CRUD (1–2 sessions)
- `queue_entries` API routes (add, list, update, delete)
- Basic staff dashboard queue panel (list + quick add form)
- No realtime yet — just fetch on load + manual refresh

### Step 3: SMS Flows (1 session)
- Joined confirmation SMS
- Table ready SMS
- No-show SMS
- Use existing Twilio integration patterns from communications engine

### Step 4: Guest-Facing Pages (2 sessions)
- Join page (public, mobile-first)
- Status page (public, shows position + estimate)
- Cancel functionality
- QR code generation for venue

### Step 5: Realtime (1 session)
- Enable Supabase Realtime on `queue_entries`
- Staff dashboard live updates
- Guest status page live updates

### Step 6: Wait Time Estimation (1–2 sessions)
- `estimateWaitTime()` function
- `table_turn_history` recording
- Periodic recalculation job
- "Almost ready" auto-notification

### Step 7: Inbound SMS (1 session)
- Twilio webhook for replies
- Keyword parsing (YES, CANCEL, LATE)
- Two-way message display in dashboard

### Step 8: Integration & Polish (1–2 sessions)
- Queue tab on reservations dashboard
- Day sheet integration (walk-in badge)
- Booking page "Join Waitlist" fallback
- Reporting metrics
- Drag-and-drop reorder
- Sound notifications

### Step 9: Auto-Expiry & Cron (1 session)
- Queue maintenance cron job
- No-show auto-detection
- Stale entry cleanup

### Step 10: Settings Polish & QR (1 session)
- Full settings UI with SMS template editor
- QR code download (PNG)
- Template variable preview
- Deposit-for-queue flow (if enabled)

---

## File Structure

```
app/
├── (dashboard)/venues/[venueId]/
│   ├── queue/
│   │   └── page.tsx                    # Staff queue dashboard
│   └── settings/queue/
│       └── page.tsx                    # Queue settings
├── (public)/queue/
│   ├── [venueSlug]/
│   │   └── join/page.tsx              # Guest self-join page
│   └── status/[guestToken]/
│       └── page.tsx                    # Guest status page
├── api/
│   ├── venues/[venueId]/queue/
│   │   ├── route.ts                   # GET list, POST add
│   │   ├── [entryId]/
│   │   │   ├── route.ts              # PATCH update, DELETE remove
│   │   │   ├── notify/route.ts       # POST send table-ready SMS
│   │   │   └── seat/route.ts         # POST mark as seated
│   │   ├── reorder/route.ts          # POST bulk reorder
│   │   └── settings/route.ts         # GET/PUT queue settings
│   ├── queue/
│   │   ├── [venueId]/
│   │   │   ├── join-info/route.ts    # GET public queue info
│   │   │   └── join/route.ts         # POST public self-join
│   │   └── status/[guestToken]/
│   │       ├── route.ts              # GET guest status
│   │       └── cancel/route.ts       # POST guest cancel
│   ├── webhooks/twilio/
│   │   └── queue-reply/route.ts      # POST inbound SMS handler
│   └── cron/
│       └── queue-maintenance/route.ts # Cron: expiry + recalc
lib/
├── queue/
│   ├── estimate-wait.ts               # Wait time estimation engine
│   ├── recalculate-positions.ts       # Position recalculation
│   ├── queue-sms.ts                   # SMS template rendering + sending
│   └── types.ts                       # TypeScript types for queue
hooks/
├── useQueueRealtime.ts                # Realtime subscription hook (staff)
└── useGuestQueueStatus.ts             # Realtime subscription hook (guest)
```

---

## Testing Checklist

- [ ] Host can add walk-in to queue → entry created, SMS sent
- [ ] Guest can self-join via QR code → form submits, SMS received, status page works
- [ ] Status page updates in real-time as position changes
- [ ] "Notify" sends table-ready SMS → guest sees "Table Ready" state on status page
- [ ] Guest replies YES → dashboard shows confirmed
- [ ] Guest replies CANCEL → entry cancelled, queue recalculates
- [ ] Guest replies LATE → note added, dashboard shows late badge
- [ ] Auto-expire works → no-show after timeout, SMS sent, queue recalculates
- [ ] Wait time estimates are reasonable and update as queue moves
- [ ] Drag-and-drop reorder works, positions recalculate
- [ ] VIP priority sorts correctly (above normal, preserving relative order)
- [ ] Queue settings save and apply correctly
- [ ] Queue respects max size → shows "full" to new joiners
- [ ] Queue respects hours → shows "closed" outside operating times
- [ ] Seated walk-ins appear on day sheet with walk-in badge
- [ ] Queue metrics appear in reporting
- [ ] Booking page shows "Join Waitlist" when no slots available
- [ ] QR code generates and downloads correctly
- [ ] Multiple staff devices see same queue in real-time
- [ ] SMS templates render variables correctly
- [ ] Phone numbers normalize to E.164 for UK numbers
- [ ] Deposit flow works (if enabled): payment → queue join → refund on seat
- [ ] Edge cases: queue entry cancelled while being notified, simultaneous notify
- [ ] Performance: queue with 30 entries loads and updates smoothly
```

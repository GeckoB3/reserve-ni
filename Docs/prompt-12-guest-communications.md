# Prompt 12 — Guest Communications Engine & Venue Settings Panel

## Context

You are building the guest communications system for ReserveNI, a restaurant reservation and table management SaaS platform. The tech stack is Next.js App Router, Supabase (Postgres with RLS), Stripe Connect, Twilio (SMS), and SendGrid (email), deployed on Vercel.

Booking confirmation emails and SMS messages are already functional and integrated with Twilio and SendGrid. The sender email is `noreply@reserveni.com`. The brand colour is `#4E6B78`.

This prompt covers two interconnected pieces:

1. **Communications Settings Panel** — a venue-configurable settings interface where restaurants control which messages are sent, their timing, and their content.
2. **Automated Communications Engine** — the scheduled and event-driven system that sends the right message at the right time based on booking status and venue configuration.

---

## Part A — Database Schema

### Table: `communication_settings`

This table stores each venue's communication preferences. One row per venue. Created automatically during venue onboarding with sensible defaults (all communications enabled).

```sql
CREATE TABLE communication_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  
  -- Booking Confirmation Email (sent immediately on booking creation)
  -- Always enabled, not toggleable — every booking gets a confirmation email
  confirmation_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  confirmation_email_custom_message TEXT DEFAULT NULL, -- Optional venue-specific message appended to the standard confirmation
  
  -- Deposit Request SMS (sent for phone bookings where venue has toggled deposit required)
  -- Contains booking details + payment link + email capture
  deposit_sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  deposit_sms_custom_message TEXT DEFAULT NULL,
  
  -- Deposit Received Confirmation Email (sent after deposit payment)
  deposit_confirmation_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  deposit_confirmation_email_custom_message TEXT DEFAULT NULL,
  
  -- 56-Hour Reminder Email (sent 56 hours before booking)
  -- Content varies based on deposit status:
  --   Deposit paid: highlights refund cutoff (48 hours before booking)
  --   No deposit / deposit not required: standard reminder
  reminder_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  reminder_email_custom_message TEXT DEFAULT NULL,
  
  -- Day-of Reminder SMS + Email (sent at a configurable time on the day of the booking)
  day_of_reminder_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  day_of_reminder_time TIME NOT NULL DEFAULT '09:00:00', -- Configurable per venue, default 9am
  day_of_reminder_sms_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  day_of_reminder_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  day_of_reminder_custom_message TEXT DEFAULT NULL,
  
  -- Post-Visit Thank You Email (sent at a configurable time on the day after the booking)
  -- ONLY sent if booking status is COMPLETED — suppressed for NO_SHOW, CANCELLED
  post_visit_email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  post_visit_email_time TIME NOT NULL DEFAULT '09:00:00', -- Configurable, default 9am next day
  post_visit_email_custom_message TEXT DEFAULT NULL,
  
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  CONSTRAINT unique_venue_settings UNIQUE (venue_id)
);

-- RLS: venue staff can read/update their own venue's settings
ALTER TABLE communication_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue staff can view own settings"
  ON communication_settings FOR SELECT
  USING (venue_id IN (
    SELECT venue_id FROM venue_staff WHERE user_id = auth.uid()
  ));

CREATE POLICY "Venue staff can update own settings"
  ON communication_settings FOR UPDATE
  USING (venue_id IN (
    SELECT venue_id FROM venue_staff WHERE user_id = auth.uid()
  ));
```

### Table: `communication_logs`

Tracks every message sent for auditability, debugging, and preventing duplicate sends.

```sql
CREATE TABLE communication_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  venue_id UUID NOT NULL REFERENCES venues(id) ON DELETE CASCADE,
  booking_id UUID NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  
  -- Message classification
  message_type TEXT NOT NULL CHECK (message_type IN (
    'booking_confirmation_email',
    'deposit_request_sms',
    'deposit_confirmation_email',
    'reminder_56h_email',
    'day_of_reminder_sms',
    'day_of_reminder_email',
    'post_visit_email'
  )),
  
  -- Delivery details
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms')),
  recipient TEXT NOT NULL, -- email address or phone number
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'delivered', 'failed', 'bounced')),
  external_id TEXT, -- SendGrid message ID or Twilio SID for tracking
  error_message TEXT, -- Populated on failure
  
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  
  -- Prevent duplicate sends
  CONSTRAINT unique_message_per_booking UNIQUE (booking_id, message_type)
);

-- Index for the scheduled job queries
CREATE INDEX idx_comm_logs_booking_type ON communication_logs(booking_id, message_type);
CREATE INDEX idx_comm_logs_venue ON communication_logs(venue_id);

ALTER TABLE communication_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Venue staff can view own logs"
  ON communication_logs FOR SELECT
  USING (venue_id IN (
    SELECT venue_id FROM venue_staff WHERE user_id = auth.uid()
  ));
```

### Migration: Add `guest_email` to bookings (if not already present)

Phone bookings may not have an email address at creation time. The email is captured when the guest pays their deposit via the payment link.

```sql
-- Ensure bookings table has guest_email column (nullable for phone bookings)
ALTER TABLE bookings ADD COLUMN IF NOT EXISTS guest_email TEXT;
```

---

## Part B — Deposit Payment Page with Email Capture

### Route: `/pay/[bookingId]`

This is a public-facing page (no auth required) linked from the deposit request SMS. It serves two purposes:

1. Collect the deposit payment via Stripe.
2. Capture the guest's email address for all subsequent email communications about this booking.

#### Requirements

- Display booking details at the top: restaurant name, date, time, party size.
- Display the deposit amount and the venue's refund policy including the calculated refund cutoff date/time (booking datetime minus 48 hours, or whatever the venue's configured refund window is).
- **Email capture field**: a text input for the guest's email address, labelled "Enter your email to receive booking confirmation and updates". This field should be:
  - Required before payment can proceed.
  - Validated as a valid email format on the client side.
  - Stored to `bookings.guest_email` on successful payment.
- **Stripe payment element**: use the existing Stripe Connect direct charge integration. On successful payment:
  1. Update `bookings.deposit_status` to `'paid'`.
  2. Update `bookings.guest_email` with the captured email.
  3. Trigger the deposit confirmation email (see Part D).
  4. Redirect to a simple success page confirming: deposit paid, confirmation email sent to [email], booking details summary.
- If the guest already has an email on file (e.g., online booking), pre-populate the email field but allow them to change it.
- Mobile-first design — most guests will open this link from an SMS on their phone.

---

## Part C — Communications Settings Panel (Venue Dashboard)

### Route: Settings → Communications (new tab within existing Settings layout)

#### UI Requirements

Build this as a clean, card-based settings page within the existing venue dashboard layout. Each communication type gets its own card.

**Overall layout:**

- Page title: "Guest Communications"
- Subtitle: "Configure the messages sent to guests throughout their booking journey. Changes are saved automatically."
- Below the subtitle, a visual timeline/sequence showing the communication flow: Confirmation → Deposit Request → 56h Reminder → Day-of Reminder → Post-Visit. This should be a simple horizontal stepper or flow diagram — not interactive, just illustrative.

**Card structure for each communication type:**

Each card contains:

1. **Header row**: Communication name (e.g., "Booking Confirmation Email") + channel badge(s) showing EMAIL and/or SMS in small pills.
2. **Enable/disable toggle**: On the right side of the header. The booking confirmation email toggle should be locked on (disabled, always checked) with a tooltip: "Booking confirmations are always sent to ensure guests have their booking details."
3. **Description**: One line explaining when this message is sent and to whom.
4. **Timing control** (where applicable): For day-of reminder and post-visit email, show a time picker. For the 56-hour reminder, show a read-only label: "Sent 56 hours before the booking".
5. **Custom message textarea**: Expandable section (collapsed by default) labelled "Add a custom message". When expanded, shows a textarea with placeholder text suggesting what the venue might write (e.g., "Add a personal touch — e.g., parking instructions, dress code, or a welcome message"). Character limit: 500 characters with a counter.
6. **Preview button**: Opens a modal showing a preview of the email or SMS as the guest would see it, using the venue's actual details and the custom message if provided. Use placeholder data for the booking details (e.g., "Friday 14 March at 7:30pm, party of 4").

**The seven cards, in order:**

1. **Booking Confirmation Email**
   - Channel: EMAIL
   - Toggle: Locked on
   - Description: "Sent immediately when a booking is created. Includes booking details and a link to manage the booking."
   - No timing control
   - Custom message: Yes

2. **Deposit Request SMS**
   - Channel: SMS
   - Toggle: Default on
   - Description: "Sent to phone booking guests when a deposit is required. Includes booking details and a secure payment link."
   - No timing control (sent immediately when deposit is requested)
   - Custom message: Yes (prepended to the standard message, max 160 chars for SMS — show character count and warn if the total message will exceed 1 SMS segment)

3. **Deposit Received Confirmation Email**
   - Channel: EMAIL
   - Toggle: Default on
   - Description: "Sent after a guest pays their deposit. Confirms the amount paid and the refund policy."
   - No timing control
   - Custom message: Yes

4. **56-Hour Reminder Email**
   - Channel: EMAIL
   - Toggle: Default on
   - Description: "Sent 56 hours before the booking. For deposit bookings, reminds guests that the refund window closes 48 hours before their booking."
   - Timing: Read-only "56 hours before booking"
   - Custom message: Yes
   - Show a small info callout: "This is sent 8 hours before the deposit refund cutoff, giving guests time to cancel if needed."

5. **Day-of Reminder SMS**
   - Channel: SMS
   - Toggle: Default on
   - Description: "A text message reminder sent on the day of the booking."
   - Timing: Time picker, default 09:00. Label: "Send at". Validation: must be between 07:00 and 14:00.
   - Custom message: Yes (max 160 chars, SMS segment awareness)

6. **Day-of Reminder Email**
   - Channel: EMAIL
   - Toggle: Default on
   - Description: "An email reminder sent on the day of the booking, alongside the SMS."
   - Timing: Shares the same time as the Day-of Reminder SMS (linked — changing one changes both). Show a note: "Sent at the same time as the Day-of SMS."
   - Custom message: Yes

7. **Post-Visit Thank You Email**
   - Channel: EMAIL
   - Toggle: Default on
   - Description: "Sent the morning after the booking to thank the guest for visiting. Only sent for completed bookings — not sent for no-shows or cancellations."
   - Timing: Time picker, default 09:00. Label: "Send at". Validation: must be between 07:00 and 12:00.
   - Custom message: Yes
   - Show a small info callout: "This email is only sent when the booking is marked as Completed."

**Auto-save behaviour:**

- Use debounced auto-save (500ms delay after last change) for all fields.
- Show a small "Saving..." indicator (spinner) near the page title that transitions to "Saved" with a checkmark, then fades after 2 seconds.
- On error, show "Failed to save" in red with a retry option.
- Use optimistic updates — the UI reflects changes immediately.

**Initialisation:**

- When a new venue is onboarded (venue creation flow), automatically insert a row into `communication_settings` with all defaults.
- The settings page loads this row. If no row exists (edge case / legacy venues), create one with defaults on first load.

---

## Part D — Automated Communications Engine

### Architecture Overview

The communications are triggered in two ways:

1. **Event-driven** (immediate sends): Triggered by database changes or API actions.
2. **Scheduled** (cron-based): A Vercel cron job runs every 15 minutes to process time-based communications.

### Event-Driven Communications

#### 1. Booking Confirmation Email

- **Trigger**: Immediately after a booking is created (insert into `bookings` table).
- **Implementation**: Call the send function from the booking creation API route, after the booking is successfully saved.
- **Recipient**: `bookings.guest_email` (for online bookings) — skip if no email (phone bookings without email yet).
- **Content**:
  - Subject: "Your booking at {venue_name} is confirmed"
  - Body:
    - Venue name, address, phone number
    - Booking date, time, party size
    - Any special requests the guest noted
    - If deposit was collected at booking time: deposit amount, refund policy, refund cutoff date/time
    - If deposit is required but not yet paid: note that a deposit request will follow
    - "Manage Booking" button/link (to modify or cancel)
    - Venue's custom message (if configured)
    - ReserveNI branding footer

#### 2. Deposit Request SMS

- **Trigger**: When venue staff mark a phone booking as requiring a deposit (this may be at booking creation or shortly after).
- **Implementation**: Call the send function from the deposit request API route.
- **Recipient**: `bookings.guest_phone` (required for phone bookings).
- **Content**:
  - "{venue_name}: Hi {guest_name}, your booking on {date} at {time} for {party_size} requires a deposit of {deposit_amount}. Pay here: {payment_link} — this link expires in {expiry_hours} hours."
  - Venue's custom message prepended if configured.
  - Keep total SMS under 160 characters where possible. If the custom message pushes it over, allow up to 320 characters (2 segments) but warn the venue in settings.

#### 3. Deposit Received Confirmation Email

- **Trigger**: After successful Stripe payment on the `/pay/[bookingId]` page.
- **Implementation**: Called from the Stripe webhook handler or the payment success callback.
- **Recipient**: `bookings.guest_email` (just captured on the payment page).
- **Content**:
  - Subject: "Deposit confirmed for your booking at {venue_name}"
  - Body:
    - "Thank you — your deposit of {deposit_amount} has been received."
    - Booking date, time, party size
    - Refund policy: "Your deposit is fully refundable if you cancel before {refund_cutoff_datetime}."
    - "Manage Booking" button/link
    - Venue's custom message (if configured)
    - ReserveNI branding footer

### Scheduled Communications (Cron Job)

#### Cron Route: `/api/cron/send-communications`

- **Schedule**: Every 15 minutes via Vercel cron.
- **Authentication**: Verify the `CRON_SECRET` header to prevent unauthorised access.
- **Architecture**: The cron handler queries for bookings that are due for each communication type, checks against `communication_logs` to avoid duplicates, checks venue settings to confirm the communication is enabled, then sends.

#### 4. 56-Hour Reminder Email

- **Query logic**: Find all bookings where:
  - `booking_datetime - NOW() <= 56 hours` AND `booking_datetime - NOW() > 55 hours 45 minutes` (i.e., within the 15-minute cron window)
  - `bookings.status` IN ('PENDING', 'CONFIRMED') — not cancelled, completed, or no-show
  - `bookings.guest_email` IS NOT NULL
  - No existing `communication_logs` entry for this booking with `message_type = 'reminder_56h_email'`
  - `communication_settings.reminder_email_enabled = TRUE` for the venue
- **Content — Deposit Paid variant**:
  - Subject: "Reminder: Your booking at {venue_name} on {date}"
  - Body:
    - "Just a reminder about your upcoming booking:"
    - Booking date, time, party size, venue address
    - **Deposit refund notice** (prominent, e.g., in a callout box): "You've paid a deposit of {deposit_amount}. If your plans change, you can cancel for a full refund before {refund_cutoff_datetime}. After this time, the deposit is non-refundable."
    - "Manage Booking" button/link
    - Venue's custom message
    - ReserveNI footer
- **Content — No Deposit / Deposit Not Required variant**:
  - Subject: "Reminder: Your booking at {venue_name} on {date}"
  - Body:
    - "Just a reminder about your upcoming booking:"
    - Booking date, time, party size, venue address
    - "If your plans have changed, please let us know so we can offer the table to someone else."
    - "Manage Booking" button/link
    - Venue's custom message
    - ReserveNI footer

#### 5. Day-of Reminder SMS

- **Query logic**: Find all bookings where:
  - `booking_date = TODAY`
  - `NOW()` is within the 15-minute window of the venue's configured `day_of_reminder_time` (e.g., if venue is set to 09:00, process between 09:00 and 09:14)
  - `bookings.status` IN ('PENDING', 'CONFIRMED')
  - `bookings.guest_phone` IS NOT NULL
  - No existing log entry for `day_of_reminder_sms`
  - `communication_settings.day_of_reminder_enabled = TRUE` AND `communication_settings.day_of_reminder_sms_enabled = TRUE`
- **Content**:
  - "Looking forward to seeing you at {venue_name} tonight at {time}! If your plans have changed, please let us know: {manage_link}"
  - Adjust "tonight" to "today" for lunch bookings (booking time before 15:00).
  - Venue's custom message prepended if configured.

#### 6. Day-of Reminder Email

- **Query logic**: Same as Day-of Reminder SMS but checks `day_of_reminder_email_enabled` and requires `guest_email` IS NOT NULL. Shares the same timing as the SMS.
- **Content**:
  - Subject: "See you today at {venue_name}!"
  - Body:
    - Booking date, time, party size
    - Venue address with a Google Maps link
    - "Manage Booking" button/link
    - Any special requests echoed back
    - Venue's custom message
    - ReserveNI footer

#### 7. Post-Visit Thank You Email

- **Query logic**: Find all bookings where:
  - `booking_date = YESTERDAY`
  - `NOW()` is within the 15-minute window of the venue's configured `post_visit_email_time`
  - **`bookings.status = 'COMPLETED'`** — this is critical. Do NOT send to NO_SHOW, CANCELLED, or any other status.
  - `bookings.guest_email` IS NOT NULL
  - No existing log entry for `post_visit_email`
  - `communication_settings.post_visit_email_enabled = TRUE`
- **Content**:
  - Subject: "Thanks for visiting {venue_name}!"
  - Body:
    - "We hope you enjoyed your visit to {venue_name}."
    - "We'd love to welcome you back — book your next visit anytime."
    - "Book Again" button/link (to the venue's booking page)
    - Venue's custom message
    - ReserveNI footer

---

## Part E — Email Templates

### Shared Template Structure

All emails should use a consistent, responsive HTML template with the following structure:

```
┌─────────────────────────────────────────────┐
│  [Venue Logo if available]                  │
│  {venue_name}                               │
├─────────────────────────────────────────────┤
│                                             │
│  {email_heading}                            │
│                                             │
│  {main_content}                             │
│                                             │
│  ┌─────────────────────────────────────┐    │
│  │  📅 {date}                          │    │
│  │  🕐 {time}                          │    │
│  │  👥 {party_size} guests             │    │
│  │  📍 {venue_address}                 │    │
│  │  📝 {special_requests}              │    │
│  └─────────────────────────────────────┘    │
│                                             │
│  {deposit_info_if_applicable}               │
│                                             │
│  {venue_custom_message_if_configured}       │
│                                             │
│  [ Manage Booking ]  (or [ Book Again ])    │
│                                             │
├─────────────────────────────────────────────┤
│  Powered by ReserveNI                       │
│  You received this email because you have   │
│  a booking at {venue_name}.                 │
└─────────────────────────────────────────────┘
```

### Design Requirements

- **Responsive**: Must render well on mobile (single-column, min 320px).
- **Brand colour**: Use `#4E6B78` for the header bar, buttons, and links.
- **Venue branding**: If the venue has uploaded a logo, display it in the header. If not, show the venue name in the brand colour.
- **Inline CSS only**: Email clients strip `<style>` blocks — all styling must be inline.
- **Button style**: Rounded rectangle, `#4E6B78` background, white text, generous padding (16px 32px).
- **Booking details card**: Light grey background (`#F5F5F5`), subtle border, clear iconography using Unicode characters (not images) for date, time, guests, location.
- **Deposit callout** (where applicable): Amber/yellow background (`#FFF3CD`) with dark text for the refund notice — this needs to visually stand out.
- **Footer**: Small text, `#888888` colour, includes "Powered by ReserveNI" and the reason for receiving the email.

### Template Implementation

Create a shared email template utility:

```
/src/lib/emails/
  templates/
    base-template.ts        -- Shared HTML wrapper (header, footer, responsive layout)
    booking-confirmation.ts
    deposit-request-sms.ts  -- SMS content builder (plain text)
    deposit-confirmation.ts
    reminder-56h.ts
    day-of-reminder-email.ts
    day-of-reminder-sms.ts  -- SMS content builder (plain text)
    post-visit.ts
  send-email.ts             -- SendGrid wrapper (already exists — extend)
  send-sms.ts               -- Twilio wrapper (already exists — extend)
  types.ts                  -- Shared types for template data
```

Each template file should export a function that takes booking data and venue data, and returns the rendered HTML (or plain text for SMS).

---

## Part F — Cron Job Implementation

### Vercel Cron Configuration

Add to `vercel.json`:

```json
{
  "crons": [
    {
      "path": "/api/cron/send-communications",
      "schedule": "*/15 * * * *"
    }
  ]
}
```

### Cron Handler Logic

```
/src/app/api/cron/send-communications/route.ts
```

**High-level flow:**

1. Verify `CRON_SECRET` from the `Authorization` header.
2. Get the current time.
3. Run the following checks in parallel (each as a separate async function):
   a. **56-hour reminders**: Query bookings 55h45m–56h away, cross-reference logs, send.
   b. **Day-of reminders**: For each venue, check if NOW is within the 15-minute window of their configured send time. Query today's bookings for matching venues, cross-reference logs, send.
   c. **Post-visit emails**: Same pattern but for yesterday's COMPLETED bookings.
4. Log all results.
5. Return a summary JSON response (for Vercel cron dashboard monitoring).

**Error handling:**

- Each individual send should be wrapped in try/catch — a failure to send one message must not prevent others from being sent.
- On send failure, log the error in `communication_logs` with `status = 'failed'` and the error message.
- The cron job itself should always return 200 (even if individual sends fail) to prevent Vercel from retrying the entire batch.

**Duplicate prevention:**

- The `UNIQUE` constraint on `(booking_id, message_type)` in `communication_logs` is the primary guard.
- Before sending, always check for an existing log entry. Use `INSERT ... ON CONFLICT DO NOTHING` when creating the log entry, and only proceed with the send if the insert succeeded.
- This makes the system idempotent — even if the cron job fires twice in the same window, no duplicate messages are sent.

---

## Part G — API Routes

### Settings API

```
GET  /api/venues/[venueId]/communication-settings
PUT  /api/venues/[venueId]/communication-settings
```

- Standard REST endpoints.
- PUT accepts a partial update (only the fields being changed).
- Both enforce venue ownership via RLS / session check.

### Communication Preview API

```
POST /api/venues/[venueId]/communication-preview
Body: { messageType: string, customMessage?: string }
Returns: { subject?: string, body: string, channel: 'email' | 'sms' }
```

- Renders the template with placeholder booking data and the venue's actual details.
- Used by the preview modal in the settings panel.

---

## Part H — Edge Cases & Business Logic

### Phone Bookings Without Email

- At booking creation: only SMS is available. Confirmation email is skipped.
- If deposit is required: the deposit request SMS is sent. The payment page captures the email.
- After deposit payment: guest_email is populated. All subsequent emails (56h reminder, day-of, post-visit) can now be sent.
- If the guest never pays the deposit (and therefore never provides an email): only SMS communications are sent for the remainder of the booking lifecycle (day-of reminder SMS only). The 56h reminder email, day-of reminder email, and post-visit email are all skipped gracefully.

### Booking Modifications

- If a guest modifies their booking (changes date/time/party size), send a **modification confirmation email** using the same template as the booking confirmation but with subject "Your booking at {venue_name} has been updated" and the updated details. Reset any already-sent reminder flags — the 56h and day-of reminders should be re-sent for the new date/time.
- Implementation: When a booking is modified, delete the relevant `communication_logs` entries for `reminder_56h_email`, `day_of_reminder_sms`, `day_of_reminder_email`, and `post_visit_email` so they are re-eligible for sending.

### Booking Cancellations

- When a booking is cancelled, suppress all future scheduled communications. The `communication_logs` check for `bookings.status IN ('PENDING', 'CONFIRMED')` handles this automatically.
- If a deposit refund is processed, that is handled by the existing deposit/refund flow — no additional communication template is needed in this prompt (future enhancement).

### Timezone Handling

- All times in `communication_settings` (day_of_reminder_time, post_visit_email_time) are in the venue's local timezone.
- Store the venue's timezone in the `venues` table (e.g., `Europe/London` for NI venues).
- The cron job must convert venue local times to UTC when determining the send window.
- For the 56-hour reminder, the calculation is straightforward: `booking_datetime (stored in UTC) - 56 hours`.

### Late Bookings

- If a booking is created less than 56 hours before the booking time, the 56-hour reminder is simply skipped (it's already past the send window). The system handles this naturally because the cron query window won't match.
- If a booking is created on the same day, the day-of reminder may already have been sent for that venue's time window. In this case, the booking confirmation email serves as the only pre-visit communication. This is acceptable.

---

## Implementation Order

1. **Database migration**: Create `communication_settings` and `communication_logs` tables. Add `guest_email` to bookings if needed.
2. **Venue onboarding**: Add automatic creation of `communication_settings` row with defaults during venue setup.
3. **Email templates**: Build the shared base template and all seven message templates.
4. **Event-driven sends**: Wire up booking confirmation email, deposit request SMS, and deposit confirmation email to their respective triggers.
5. **Deposit payment page**: Build `/pay/[bookingId]` with email capture and Stripe integration.
6. **Cron job**: Implement `/api/cron/send-communications` with the 56h reminder, day-of reminder, and post-visit email.
7. **Settings panel UI**: Build the communications settings page in the venue dashboard.
8. **Preview functionality**: Implement the preview modal and API.

---

## Testing Considerations

- Test the cron job with bookings at various times to verify the 15-minute window logic.
- Test the 56-hour reminder with both deposit-paid and no-deposit bookings to verify content branching.
- Test phone bookings through the full flow: booking → deposit SMS → payment page → email capture → subsequent emails.
- Test the post-visit email suppression: create a NO_SHOW booking and verify no thank-you email is sent.
- Test booking modification: modify a booking after the 56h reminder has been sent, verify the reminder is re-sent for the new date.
- Test the settings panel: disable a communication type, verify it is no longer sent. Re-enable it, verify it resumes.
- Test edge case: booking created 30 minutes before the booking time — verify no reminder errors, only confirmation is sent.

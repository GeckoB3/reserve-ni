# ReserveNI — Pricing & Onboarding Overview

**Reference Document for Cursor AI Agent**
**March 2026 | Version 4**

---

## 1. Pricing Structure

ReserveNI uses two pricing tiers. Both tiers include the full booking and management feature set. The tiers differ in how billing works, communication channels, whether table management is included, and support level.

### The Two Tiers

**Standard — £10/month per bookable calendar**
- Scales linearly: 1 calendar = £10, 3 calendars = £30, 5 calendars = £50
- All booking and management features included
- Email communications (reminders, confirmations, confirm-or-cancel)
- Email support

**Business — £79/month flat**
- Unlimited bookable calendars
- All booking and management features included
- Email AND SMS communications (reminders, confirmations, confirm-or-cancel via SMS)
- Table management with timeline grid and floor plan (for restaurants and hospitality)
- Priority support (direct founder access during pilot, faster response times ongoing)

### Why Two Tiers

The Standard per-user pricing is directly competitive with platforms like Fresha (£10/user/month) and undercuts Booksy ($29.99/user/month). It scales fairly — a solo barber pays £10, a salon with 4 stylists pays £40. No cliff edges, no surprises.

The Business tier exists primarily for restaurants and larger operations. At 8 bookable calendars, per-user pricing would reach £80/month, making Business the better deal at £79. Restaurants naturally gravitate here because they need unlimited capacity, SMS reminders, and table management. Any business type can choose Business if they want unlimited calendars, SMS, or if it works out cheaper than per-user pricing at 8+ calendars.

### Communication Channels by Tier

**Standard tier — Email only:**
- Booking confirmation: email
- Booking reminder (24 hours before): email
- Confirm-or-cancel prompt: email with link to the confirm-or-cancel web page
- Cancellation confirmation: email
- No-show notification: email
- Deposit payment request (phone bookings): email
- Auto-cancel notification: email

**Business tier — Email and SMS:**
- Booking confirmation: email
- Booking reminder (24 hours before): SMS
- Confirm-or-cancel prompt: SMS with short link to the confirm-or-cancel web page
- Cancellation confirmation: email
- No-show notification: email
- Deposit payment request (phone bookings): SMS with payment link
- Auto-cancel notification: email and SMS

The confirm-or-cancel system is available on BOTH tiers. On Standard, it is delivered via email with a link to the same mobile-friendly confirm-or-cancel web page. On Business, it is delivered via SMS for higher open rates and faster response. The web page and functionality are identical — only the delivery channel differs.

This matters commercially because SMS is the most expensive variable cost (Twilio charges per message). At £10/month per calendar, including SMS would significantly erode margins. Email delivery via SendGrid is essentially free at these volumes. Reserving SMS for the Business tier protects margins on Standard while creating a genuine, experience-based upgrade incentive — when a Standard user sees that some clients miss email reminders and no-show, the value of SMS becomes tangible.

### What Every Tier Includes

Both Standard and Business include:
- Online booking page with QR code and iFrame widget
- Confirm-or-cancel system (email on Standard, SMS on Business)
- Email reminders and confirmations (automated)
- Deposit collection via Stripe Connect
- Client/guest records with visit history
- Staff accounts with admin/staff roles
- Reporting with CSV export
- Stripe Connect for direct payments to the business
- Multi-practitioner scheduling with service assignment (appointment model)
- Event management with ticket types (experience model)
- Class timetable management (class model)
- Resource scheduling (resource model)

### Features Exclusive to Business Tier

- SMS communications (reminders, confirm-or-cancel via SMS, deposit request via SMS)
- Table management with timeline grid and floor plan (for restaurants/hospitality)
- Priority support

### What "Bookable Calendar" Means Per Business Type

The concept of a "bookable calendar" adapts to the business model:

- **Restaurants (Model A):** 1 calendar = the restaurant itself (the whole venue's availability). A small cafe can operate on Standard at £10/month with email-only reminders. Business tier recommended for SMS reminders, table management, and priority support.
- **Appointment businesses (Model B):** 1 calendar = 1 practitioner. A solo barber = £10/month. A salon with 4 stylists = £40/month. A clinic with 10 physios = Business tier at £79/month (cheaper than £100/month on Standard).
- **Experiences/Events (Model C):** 1 calendar = 1 experience type. A single escape room = £10/month. Three rooms = £30/month.
- **Classes (Model D):** 1 calendar = 1 class type. A studio running 2 class types = £20/month. A full timetable with many class types = Business tier.
- **Resources (Model E):** 1 calendar = 1 bookable resource. A single tennis court = £10/month. A facility with 4 courts = £40/month.

### The Natural Crossover Point

At 8 bookable calendars, Standard pricing (£80/month) exceeds the Business tier (£79/month). The system should prompt users approaching this threshold: "You have 7 calendars at £70/month. Adding one more would be £80/month — upgrade to Business for £79/month with unlimited calendars, SMS reminders, table management, and priority support." This makes the upgrade feel like a saving rather than an upsell.

### Multi-Venue Pricing (Future — Do Not Build Yet)

For restaurant groups or businesses with multiple locations:
- 1 venue: standard tier price
- 2–5 venues: £69/month per venue on Business tier
- 6+ venues: £59/month per venue on Business tier

This is handled through manual Stripe coupons for now. A venue switcher dashboard and consolidated reporting are Phase 3 features. For now, add an `organisation_id` (UUID, nullable) column to the venues table to future-proof the data model.

### Founding Partner Programme (Restaurants Only, Limited)

The first 20 restaurants get the Business tier free for 6 months, then move to £79/month. This programme is not available for other business types. After the founding cohort is full, replace with a standard 14-day free trial across all tiers for all business types.

---

## 2. Feature Access by Tier

| Feature | Standard (£10/calendar) | Business (£79) |
|---|---|---|
| Online booking page | ✅ | ✅ |
| iFrame widget | ✅ | ✅ |
| QR code | ✅ | ✅ |
| Email reminders | ✅ | ✅ |
| Email confirm-or-cancel | ✅ | ✅ |
| SMS reminders | ❌ | ✅ |
| SMS confirm-or-cancel | ❌ | ✅ |
| SMS deposit request | ❌ | ✅ |
| Deposit collection | ✅ | ✅ |
| Stripe Connect | ✅ | ✅ |
| Client/guest records | ✅ | ✅ |
| Staff accounts | ✅ | ✅ |
| Reporting with CSV export | ✅ | ✅ |
| Email communications | ✅ | ✅ |
| Bookable calendars | Pay per calendar | Unlimited |
| Table management | ❌ | ✅ |
| Timeline grid | ❌ | ✅ |
| Floor plan editor & live view | ❌ | ✅ |
| Priority support | ❌ | ✅ |

---

## 3. Onboarding Flow — Complete Journey

The onboarding flow is the same for every business type. The steps adapt their content based on the business type and booking model, but the structure is universal.

### Step 1: Landing Page (`/`)

User arrives at the Reserve NI landing page. The page is general-purpose — it speaks to all bookable businesses, not just restaurants. It includes:
- Hero section positioning ReserveNI for all NI businesses
- Business type showcase (cards for restaurants, beauty, health, fitness, experiences, etc.)
- Two-tier pricing section with clear feature comparison and per-user calculator
- Founding Partner callout (restaurants only, limited spots)
- FAQ and footer

**Pricing section design:**

Two cards side by side:

Card 1 — **Standard**
- Large price: '£10/month'
- Subtitle: 'per team member'
- Interactive calculator below: a stepper (1-10+) that updates dynamically:
  - "1 team member: **£10/month**"
  - "3 team members: **£30/month**"
  - "5 team members: **£50/month**"
- Bullet list of included features (all booking features, email reminders, email confirm-or-cancel, deposits, client records, reporting)
- CTA: 'Get Started'
- Best for: "Solo practitioners, small salons, clinics, studios, and any team up to 7"

Card 2 — **Business**
- Large price: '£79/month'
- Subtitle: 'unlimited team members'
- Highlight: 'Best value for teams of 8+'
- Bullet list: everything in Standard, PLUS SMS reminders and confirm-or-cancel, table management, and priority support
- CTA: 'Get Started'
- Best for: "Restaurants, large teams, and busy operations"

Below both cards: "No per-booking fees. No commission. Cancel anytime."

Founding Partner banner below pricing (if spots remain): "Founding Partner Programme — First 20 restaurants get the Business tier free for 6 months. [X spots remaining]. Apply now →"

CTAs on the landing page all lead to `/signup`.

### Step 2: Account Creation (`/signup`)

Minimal form: email, password, terms checkbox. One job: create the auth account. No business information collected here. Redirect to `/signup/business-type` after account creation.

### Step 3: Business Type Selection (`/signup/business-type`)

User selects their specific business type from a grouped visual selector (Restaurants & Hospitality, Beauty & Grooming, Health & Wellness, Fitness & Classes, Experiences & Events, Sports & Facilities, Professional Services, Education, Pets, Other).

Selecting a type determines:
- The booking model (A/B/C/D/E)
- The default terminology
- The default services and settings
- Which dashboard views they will see

It does NOT determine the price. After selecting, redirect to `/signup/plan`.

### Step 4: Plan Selection (`/signup/plan`)

User chooses their tier: Standard (£10/calendar/month) or Business (£79/month flat).

**For Standard tier:**
After selecting Standard, show the calendar count selector: "How many [practitioners/rooms/resources] will you have?" (terminology adapted to their business type). Number stepper with dynamic price: "X × £10/month = £Y/month". Quick presets: "Just me (£10/month)", "2 (£20/month)", "3 (£30/month)".

If the user selects 8 or more calendars on Standard, show a nudge: "At [N] calendars, that's £[N×10]/month. The Business tier is £79/month for unlimited calendars plus SMS reminders, table management, and priority support. Switch to Business?" with a button to switch.

**For Business tier:**
No calendar count needed — it's unlimited. Show a simple confirmation.

**For restaurants:**
Recommend Business tier by default (highlight it). Show a note: "Restaurants benefit from SMS reminders and table management, which are included in the Business tier." Still allow them to select Standard at £10/month if they prefer email-only reminders and the simpler covers-based model without table management.

**For Founding Partners (restaurants via ?plan=founding link):**
Show an additional option above the two tiers: "Founding Partner — Business tier free for 6 months, then £79/month. X of 20 spots remaining." If spots are full, hide this option.

After selecting, redirect to `/signup/payment`.

### Step 5: Payment (`/signup/payment`)

Show an order summary confirming what the user selected:
- Business type: [e.g. Barber]
- Plan: [e.g. Standard — 2 team members — £20/month]
- Or: [e.g. Business — Unlimited — £79/month]
- Communications: [e.g. "Email reminders and confirm-or-cancel" for Standard, or "Email and SMS reminders and confirm-or-cancel" for Business]
- "All booking features included. Cancel anytime with 30 days notice."

CTA: "Proceed to Payment" → redirects to Stripe Checkout (hosted by Stripe).

**Stripe Checkout configuration:**

For Standard tier:
- Use STRIPE_STANDARD_PRICE_ID (£10/month per unit)
- Set `quantity` to the selected calendar count
- mode: 'subscription'

For Business tier:
- Use STRIPE_BUSINESS_PRICE_ID (£79/month flat)
- quantity: 1
- mode: 'subscription'

For Founding Partners: show "Founding Partner — Free for 6 months" and a CTA "Activate Free Plan" that skips Stripe entirely.

After successful Stripe payment, redirect to `/onboarding`.

### Step 6: Setup Wizard (`/onboarding`)

The wizard adapts based on booking model. All models share the first step (business profile) and last step (preview and go live). The middle steps are model-specific.

**All models — Step 1: Your Business**
Business name, address, phone, photo/logo upload, short description. Creates the venue record.

**Model A (table_reservation) — Restaurant wizard:**
Step 2: Opening Hours → Step 3: Slot Model & Capacity → Step 4: Deposits → Step 5: Preview & Go Live.
(This is the existing restaurant wizard — no changes.)

**Model B (practitioner_appointment) — Appointment wizard:**
Step 2: Your Team (add practitioners with working hours — pre-create entries matching the calendar count selected at payment) → Step 3: Your Services (pre-populated defaults, durations, prices) → Step 4: Preview & Go Live.

**Model C (event_ticket) — Event wizard:**
Step 2: Your First Event (name, dates, capacity, ticket types and prices) → Step 3: Preview & Go Live.

**Model D (class_session) — Class wizard:**
Step 2: Your Classes & Timetable (class types with schedule) → Step 3: Preview & Go Live.

**Model E (resource_booking) — Resource wizard:**
Step 2: Your Resources (bookable items with availability and pricing — pre-create entries matching the calendar count selected at payment) → Step 3: Preview & Go Live.

The final step for all models shows the live booking page preview, the shareable URL, QR code, and embed code. CTA: "Go to Your Dashboard".

### Step 7: Dashboard First-Time Experience (`/dashboard`)

User lands on their model-appropriate dashboard with:
- Welcome banner with business name
- Setup checklist adapted to their model (items checked off based on what was completed in the wizard)
- Empty state with action prompts if no bookings yet
- Dashboard navigation showing only the views relevant to their booking model

### Tier Enforcement in the Dashboard

1. **Calendar limit (Standard tier only):** When a user tries to add a practitioner, resource, class type, or event that would exceed their paid calendar count, show a message: "You currently pay for [N] calendars. To add another, your plan will increase to £[N+1 × 10]/month." with a confirm button that updates the Stripe subscription quantity. If they've reached 7 and try to add an 8th, also show: "Or upgrade to Business at £79/month for unlimited calendars, SMS reminders, table management, and priority support."

2. **SMS communications (Business tier only):** The communication engine checks the venue's pricing_tier before sending any SMS. If pricing_tier is 'standard', all communications are sent via email only. If pricing_tier is 'business', reminders and confirm-or-cancel prompts are sent via SMS (with email as a secondary channel). The confirm-or-cancel web page is identical for both tiers — only the delivery method to the client differs. In the dashboard settings, Standard tier users see the SMS section with a note: "SMS reminders are available on the Business plan. Your clients currently receive reminders by email. Upgrade to Business for SMS." with an upgrade button.

3. **Table management (Business tier only):** Only shown in the dashboard navigation and settings when the venue's pricing_tier is 'business' AND the booking_model is 'table_reservation'. For Standard tier and non-restaurant models, table management UI is completely hidden — not locked, not greyed out, simply not present.

4. **Adding calendars on Standard is frictionless:** Unlike a traditional upgrade flow, adding a calendar on Standard doesn't require a whole new checkout. It updates the existing Stripe subscription quantity via the API: `stripe.subscriptions.update(subscriptionId, { items: [{ id: itemId, quantity: newCount }] })`. The price adjusts automatically with proration. The user sees: "Calendar added. Your monthly payment is now £[new total]."

---

## 4. Stripe Configuration

### Products and Prices to Create in Stripe Dashboard

**Product: "Reserve NI Standard"**
- Price: £10.00 GBP, recurring monthly, per unit (this allows setting quantity for number of calendars)
- Copy the Price ID → set as STRIPE_STANDARD_PRICE_ID

**Product: "Reserve NI Business"**
- Price: £79.00 GBP, recurring monthly
- Copy the Price ID → set as STRIPE_BUSINESS_PRICE_ID

**Webhook endpoint:**
- URL: `{your-domain}/api/webhooks/stripe-onboarding`
- Events: checkout.session.completed, customer.subscription.updated, invoice.payment_succeeded, invoice.payment_failed, customer.subscription.deleted
- Copy signing secret → set as STRIPE_ONBOARDING_WEBHOOK_SECRET

### Environment Variables

```
STRIPE_STANDARD_PRICE_ID=price_xxxxx
STRIPE_BUSINESS_PRICE_ID=price_xxxxx
STRIPE_ONBOARDING_WEBHOOK_SECRET=whsec_xxxxx
```

---

## 5. Database Fields on Venues Table

Add these columns (all with defaults that match existing restaurant data):

```sql
ALTER TABLE venues ADD COLUMN booking_model TEXT NOT NULL DEFAULT 'table_reservation';
ALTER TABLE venues ADD COLUMN business_type TEXT NOT NULL DEFAULT 'restaurant';
ALTER TABLE venues ADD COLUMN business_category TEXT NOT NULL DEFAULT 'hospitality';
ALTER TABLE venues ADD COLUMN pricing_tier TEXT NOT NULL DEFAULT 'business';
  -- values: 'standard', 'business', 'founding'
ALTER TABLE venues ADD COLUMN plan_status TEXT NOT NULL DEFAULT 'active';
  -- values: 'active', 'past_due', 'cancelled', 'trialing'
ALTER TABLE venues ADD COLUMN stripe_customer_id TEXT;
ALTER TABLE venues ADD COLUMN stripe_subscription_id TEXT;
ALTER TABLE venues ADD COLUMN stripe_subscription_item_id TEXT;
  -- needed for updating quantity on Standard tier subscriptions
ALTER TABLE venues ADD COLUMN founding_free_period_ends_at TIMESTAMPTZ;
ALTER TABLE venues ADD COLUMN onboarding_step INT DEFAULT 0;
ALTER TABLE venues ADD COLUMN onboarding_completed BOOLEAN DEFAULT false;
ALTER TABLE venues ADD COLUMN terminology JSONB DEFAULT '{"client":"Guest","booking":"Reservation","staff":"Staff","noShow":"No-show"}';
ALTER TABLE venues ADD COLUMN calendar_count INT DEFAULT 1;
  -- current number of paid calendars (Standard tier), null for Business tier (unlimited)
ALTER TABLE venues ADD COLUMN organisation_id UUID;
  -- nullable, for future multi-venue grouping
```

---

## 6. Access Control Summary

| User State | Destination |
|---|---|
| Not authenticated | `/login` |
| Authenticated, no venue | `/signup/business-type` |
| Authenticated, venue exists, onboarding incomplete | `/onboarding` (resume at saved step) |
| Authenticated, venue exists, plan_status = 'cancelled' | Resubscribe page |
| Authenticated, venue exists, onboarding complete | `/dashboard` (routed by booking_model) |

---

## 7. Communication Engine — Tier-Aware Routing

The existing communication engine (channel abstraction layer with EmailChannel and SMSChannel) needs a tier check added to the routing logic in `service.ts`.

### Updated Message Routing

```
MESSAGE_CHANNELS (Standard tier):
  booking_confirmation       → [email]
  deposit_payment_request    → [email]
  confirm_or_cancel_prompt   → [email]
  cancellation_confirmation  → [email]
  no_show_notification       → [email]
  auto_cancel_notification   → [email]
  booking_reminder           → [email]

MESSAGE_CHANNELS (Business tier):
  booking_confirmation       → [email]
  deposit_payment_request    → [sms]
  confirm_or_cancel_prompt   → [sms]
  cancellation_confirmation  → [email]
  no_show_notification       → [email]
  auto_cancel_notification   → [email, sms]
  booking_reminder           → [sms]
```

The `CommunicationService.send()` method should accept the venue's pricing_tier and use it to determine which channel map to apply. If tier is 'standard', use the email-only map. If tier is 'business' or 'founding', use the email+SMS map.

The confirm-or-cancel email template should include the same link to the `/confirm/[bookingId]/[token]` web page. The page itself is identical regardless of how the client arrived at it. The only difference is delivery: email for Standard, SMS for Business.

---

## 8. Upgrade, Downgrade & Calendar Management

### Adding Calendars (Standard Tier)

When a Standard tier user adds a new practitioner, resource, class type, or event:
1. Check if they have capacity within their current calendar_count.
2. If yes: allow it, no billing change.
3. If no: show a confirmation: "Adding this [practitioner/resource] will increase your plan to £[new total]/month. Confirm?" On confirm, update the Stripe subscription quantity via `stripe.subscriptions.update()`, update calendar_count on the venue, and allow the addition.
4. If the new count would be 8+: also show the Business tier option: "Or switch to Business at £79/month for unlimited calendars, SMS reminders, table management, and priority support."

### Removing Calendars (Standard Tier)

When a Standard tier user deactivates or removes a practitioner/resource/class/event:
1. Reduce the Stripe subscription quantity.
2. Update calendar_count on the venue.
3. The reduced price takes effect on the next billing cycle (Stripe handles proration).

### Upgrade to Business

User chooses to upgrade → create a new Stripe Checkout session for the Business tier → on success, cancel the old Standard subscription and activate the Business subscription → update pricing_tier to 'business', calendar_count to null (unlimited) → table management becomes available if booking_model is 'table_reservation' → SMS communications activate immediately → all future reminders and confirm-or-cancel prompts are sent via SMS.

### Downgrade from Business to Standard

User requests downgrade in settings → count their current active calendars → show: "You have [N] active calendars. On the Standard plan, this would be £[N × 10]/month." If N <= 7, proceed. If N >= 8, warn: "The Standard plan would cost £[N × 10]/month, which is more than your current Business plan at £79/month. Are you sure?" → also warn: "SMS reminders will be replaced with email reminders on the Standard plan." → if table management was in use: "Table management is only available on Business. Your table data will be preserved but hidden." → on confirm, cancel Business subscription, create Standard subscription with quantity = N → update pricing_tier, calendar_count → SMS communications deactivate, switch to email-only.

### Cancellation

User requests cancellation → confirmation: "Your account will remain active until [end of billing period]. After that, your booking page stops accepting new bookings. Existing bookings are unaffected. You can export all your data." → cancel Stripe subscription at period end → webhook sets plan_status = 'cancelled' → dashboard shows resubscribe prompt.

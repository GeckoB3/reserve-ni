# ReserveNI — Plan Selection & Tier Routing for Model A and Model B

## Cursor Prompt

> **Cursor Prompt:**
>
> "Implement tier-aware plan selection and enforcement for ReserveNI. The system has two pricing tiers (Standard at £10/calendar/month and Business at £79/month flat) and two active booking models (Model A: table_reservation for restaurants, Model B: practitioner_appointment for service businesses). The rules are simple: Model A businesses MUST be on the Business plan. Model B businesses can choose either plan.
>
> ---
>
> **PLAN SELECTION PAGE (`/signup/plan`):**
>
> This page must check the user's selected booking_model (stored in session state from the business type selection step) and behave differently based on it:
>
> **If booking_model is 'table_reservation' (restaurants, cafes, pubs, bars, hotel restaurants):**
> - Do NOT show the Standard/Business plan choice cards.
> - Instead, show a single confirmation screen:
>   - Heading: 'Your plan'
>   - Plan card: 'Reserve NI Business — £79/month' with the full benefit list (unlimited calendars, SMS reminders, confirm-or-cancel via SMS, table management with timeline grid and floor plan, priority support).
>   - A brief note: 'The Business plan includes everything you need to manage your restaurant, including SMS reminders, deposit collection, and table management.'
>   - CTA: 'Continue to Payment'
> - If the user arrived via a Founding Partner link (?plan=founding) and spots remain, show the Founding Partner option instead: 'Founding Partner — Business plan free for 6 months, then £79/month. X of 20 spots remaining.' with CTA: 'Activate Founding Partner Plan' (which skips Stripe and redirects to /onboarding).
> - There is no option to select Standard. The user cannot change the plan. The tier is automatically set to 'business'.
>
> **If booking_model is 'practitioner_appointment' (barbers, physios, beauty therapists, etc.):**
> - Show two plan cards side by side:
>
>   Card 1 — Standard (£10/month per team member):
>   - Benefits: Clients book online 24/7, automated email reminders, one-tap confirm or cancel via email, collect deposits at booking, see your full schedule at a glance, client records with visit history, your own branded booking page
>   - Below the benefits: calendar count selector — 'How many [terminology.staff_members] will use ReserveNI?' with a number stepper (1-10+) and dynamic price display: '[N] × £10/month = £[total]/month'. Quick presets: 'Just me (£10)', '2 (£20)', '3 (£30)'.
>   - If the user selects 8 or more: show a nudge banner: 'At [N] team members, that's £[total]/month. The Business plan is £79/month for unlimited team members plus SMS reminders and priority support.' with a 'Switch to Business' button.
>   - CTA: 'Continue with Standard'
>
>   Card 2 — Business (£79/month):
>   - Benefits: Everything in Standard, PLUS SMS reminders that actually get read (98% open rate vs 20% for email), confirm-or-cancel via text, unlimited team members at one flat price, priority support
>   - Note: 'Best value for teams of 8+'
>   - CTA: 'Continue with Business'
>
> **If booking_model is 'event_ticket', 'class_session', or 'resource_booking' (Models C, D, E — not yet fully built but handle the routing now):**
> - Show the same two-card choice as Model B, with terminology adapted to the model (e.g. 'How many [rooms/classes/resources]' instead of 'team members').
>
> ---
>
> **PAYMENT PAGE (`/signup/payment`):**
>
> Show an order summary based on the selected plan:
>
> For Business tier:
> - 'Reserve NI Business — £79/month'
> - 'Unlimited team members. SMS reminders. Priority support.'
> - If Model A: also mention 'Table management with timeline grid and floor plan.'
>
> For Standard tier:
> - 'Reserve NI Standard — [N] × £10/month = £[total]/month'
> - '[N] bookable calendar[s]. Email reminders.'
>
> Both show: 'Cancel anytime with 30 days notice.' and CTA: 'Proceed to Payment' → Stripe Checkout.
>
> Stripe Checkout session creation:
> - For Standard: use STRIPE_STANDARD_PRICE_ID with quantity = selected calendar count.
> - For Business: use STRIPE_BUSINESS_PRICE_ID with quantity = 1.
> - For Founding Partner: skip Stripe, create venue with pricing_tier='founding', plan_status='active', founding_free_period_ends_at = now() + 6 months.
> - All sessions include metadata: { user_id, business_type, booking_model, pricing_tier, calendar_count }.
>
> ---
>
> **DASHBOARD SETTINGS — PLAN MANAGEMENT:**
>
> Add a 'Your Plan' section to the dashboard settings page. Its content depends on the venue's booking_model and pricing_tier:
>
> **Model A businesses (restaurants) on Business or Founding tier:**
> - Show: 'Plan: Reserve NI Business — £79/month' (or 'Founding Partner — Free until [date]')
> - Show: 'Includes: Unlimited calendars, SMS reminders, table management, priority support'
> - Show: 'Cancel subscription' link (leads to cancellation confirmation flow)
> - Do NOT show any downgrade option. Do NOT show the Standard plan. Do NOT show a plan comparison. Restaurants stay on Business.
>
> **Model B businesses on Standard tier:**
> - Show: 'Plan: Reserve NI Standard — [N] calendar[s] — £[total]/month'
> - Show: 'Includes: Online booking, email reminders, email confirm-or-cancel, deposits, reporting'
> - Show a 'Change team size' option: opens the calendar count stepper. Increasing the count shows a confirmation ('Your plan will increase to £[new total]/month. Confirm?') and updates the Stripe subscription quantity via `stripe.subscriptions.update()`. Decreasing shows a confirmation and reduces the quantity.
> - Show an 'Upgrade to Business' card below: 'Get SMS reminders, unlimited team members, and priority support for £79/month.' with an 'Upgrade' button.
> - If the user currently has 7+ calendars, show: 'You're paying £[total]/month. Business is £79/month for unlimited — you'd save £[difference] and get SMS reminders.' 
> - Show: 'Cancel subscription' link.
>
> **Model B businesses on Business tier:**
> - Show: 'Plan: Reserve NI Business — £79/month'
> - Show: 'Includes: Unlimited calendars, SMS reminders, priority support'
> - Show a 'Switch to Standard' option with the warning: 'On Standard, you'd pay £[N × 10]/month for your [N] active calendars. SMS reminders would be replaced with email reminders.' If N >= 8, add: 'This would cost more than your current plan.' Require confirmation before processing.
> - Show: 'Cancel subscription' link.
>
> ---
>
> **COMMUNICATION ENGINE — TIER-AWARE ROUTING:**
>
> Update the CommunicationService in `lib/communications/service.ts` to check the venue's pricing_tier before determining the delivery channel for each message type.
>
> Add a function or modify the existing routing logic:
>
> ```
> function getChannelsForMessage(messageType, pricingTier):
>   // These always go via email regardless of tier
>   if messageType in ['booking_confirmation', 'cancellation_confirmation', 'no_show_notification']:
>     return ['email']
>
>   // These use SMS on Business, email on Standard
>   if messageType in ['confirm_or_cancel_prompt', 'booking_reminder']:
>     if pricingTier in ['business', 'founding']:
>       return ['sms']
>     else:
>       return ['email']
>
>   // Deposit request uses SMS on Business, email on Standard
>   if messageType is 'deposit_payment_request':
>     if pricingTier in ['business', 'founding']:
>       return ['sms']
>     else:
>       return ['email']
>
>   // Auto-cancel uses both channels on Business, email only on Standard
>   if messageType is 'auto_cancel_notification':
>     if pricingTier in ['business', 'founding']:
>       return ['email', 'sms']
>     else:
>       return ['email']
>
>   return ['email']  // default fallback
> ```
>
> Ensure that every call to `sendCommunication()` or `CommunicationService.send()` passes the venue's pricing_tier (fetch it from the venue record if not already available in context). The existing email templates for confirm-or-cancel should include the same link to `/confirm/[bookingId]/[token]` — the page and functionality are identical regardless of delivery channel.
>
> The 24-hour reminder cron job (`/api/cron/reminder-24h`) must also respect the tier: fetch the venue's pricing_tier for each booking being reminded, and send via the appropriate channel.
>
> ---
>
> **CALENDAR LIMIT ENFORCEMENT:**
>
> When a Standard tier user attempts to add a new practitioner (or resource/class/event for other models):
>
> 1. Count their current active calendars (active practitioners for Model B).
> 2. Compare against their venue's calendar_count (the number they're paying for).
> 3. If within limit: allow the addition, no billing change.
> 4. If at limit: show a modal: 'You currently pay for [N] calendar[s]. Adding another [practitioner/resource] will increase your plan to £[(N+1) × 10]/month.' Two buttons: 'Confirm — update my plan' and 'Cancel'.
> 5. On confirm: call an API endpoint that runs `stripe.subscriptions.update(subscriptionId, { items: [{ id: subscriptionItemId, quantity: newCount }] })`, then update calendar_count on the venue, then allow the addition.
> 6. If the new count would be 8+: also show a Business tier nudge: 'Or upgrade to Business at £79/month for unlimited calendars, SMS reminders, and priority support.' with an 'Upgrade to Business' button.
>
> For Business tier users: no calendar limit check. Always allow additions.
>
> For Model A businesses: no calendar limit check (they are always on Business tier).
>
> ---
>
> **TABLE MANAGEMENT VISIBILITY:**
>
> Table management features (timeline grid at `/dashboard/table-grid`, floor plan at `/dashboard/floor-plan`, table settings at `/dashboard/settings/tables`) must ONLY be visible in the dashboard navigation and settings when BOTH conditions are true:
> - venue.pricing_tier is 'business' or 'founding'
> - venue.booking_model is 'table_reservation'
>
> If either condition is false, these nav items and pages are completely hidden — not locked, not greyed out, not shown with an upgrade prompt. Simply not rendered.
>
> If a Model A business on Business tier has table_management_enabled set to false on their venue (they chose not to use it), the nav items are still hidden — they become visible only when the venue enables table management in their settings.
>
> ---
>
> **TESTING SCENARIOS:**
>
> Verify all of the following work correctly:
>
> 1. A restaurant signs up → sees only Business plan at £79/month on the plan page → pays → enters restaurant wizard → lands on restaurant dashboard with table management available. No option to switch to Standard anywhere in settings.
>
> 2. A restaurant applies as Founding Partner → sees Founding Partner option → activates free → enters restaurant wizard → lands on restaurant dashboard. Settings show 'Founding Partner — Free until [date]'. No downgrade option.
>
> 3. A solo barber signs up → sees Standard and Business plan choice → selects Standard with 1 calendar (£10/month) → pays → enters appointment wizard → lands on practitioner calendar dashboard. Communications are email-only. Settings show plan with option to add calendars or upgrade to Business.
>
> 4. A salon with 4 stylists signs up → selects Standard with 4 calendars (£40/month) → pays → enters wizard, adds 4 practitioners → all works. Later, tries to add a 5th practitioner → allowed (within calendar_count if they selected 5, or prompted to increase if they selected 4).
>
> 5. A salon selects 8 calendars on the Standard plan page → sees the nudge: 'Business is £79/month for unlimited — cheaper than £80/month' → switches to Business → pays £79 → gets SMS reminders activated.
>
> 6. A Model B business on Standard receives a booking → booking confirmation sent via email → 24-hour reminder sent via email → confirm-or-cancel link sent via email → client clicks link → arrives at the same confirm-or-cancel web page → confirms → works identically to SMS flow.
>
> 7. A Model B business on Business receives a booking → booking confirmation sent via email → 24-hour reminder sent via SMS → confirm-or-cancel link sent via SMS → client clicks link → same confirm-or-cancel page → works.
>
> 8. A Model B business on Standard upgrades to Business via settings → Stripe subscription changes → pricing_tier updates to 'business' → next reminder goes via SMS instead of email → calendar limit removed.
>
> 9. A Model B business on Business downgrades to Standard → warned about SMS removal and calendar count → confirms → pricing_tier updates → next reminder goes via email → calendar limit enforced.
>
> 10. A large barber shop (10 practitioners) on Business tier → dashboard shows practitioner calendar (NOT restaurant dashboard) → no table management visible → SMS reminders active → settings show Business plan with downgrade warning about cost (10 × £10 = £100 > £79).
>
> **CRITICAL RULES:**
> - Do NOT change any existing restaurant dashboard, booking flow, or onboarding wizard functionality.
> - Do NOT show table management to any non-restaurant business, regardless of their tier.
> - Do NOT show the Standard plan option to Model A (restaurant) businesses at any point — not during onboarding, not in settings, nowhere.
> - Do NOT send SMS for Standard tier businesses under any circumstances. Every call to the SMS channel must check the tier first.
> - The confirm-or-cancel web page at `/confirm/[bookingId]/[token]` must work identically regardless of how the client arrived at it (email link or SMS link). Do not create separate pages or flows per channel."

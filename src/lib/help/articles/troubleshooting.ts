import type { HelpCategory } from '../types';

export const troubleshootingCategory: HelpCategory = {
  slug: 'troubleshooting',
  title: 'Troubleshooting',
  description: 'Fix common issues with Stripe, SMS, availability, imports, and access.',
  plan: 'all',
  articles: [
    {
      slug: 'stripe-issues',
      title: 'Stripe and payment problems',
      description: 'Connect onboarding, restricted accounts, guest checkout failures, and plan vs Connect confusion.',
      tags: ['stripe', 'payments', 'errors'],
      content: `
# Stripe & payment problems

## “Charges not enabled”

Complete every **Connect** requirement in **Settings → Payments**. Stripe often needs **identity documents** or **bank verification**—open the Stripe Dashboard using the in-app links.

## Guest payments fail

- Confirm the **booking** still exists and is in a state that allows payment.
- Check **browser** blockers and third-party cookie settings for embedded flows.
- Retry with another card to rule out issuer declines.

## Wrong Stripe account

Connect the **legal entity** that should receive guest money—switching later requires Stripe’s disconnected/reconnected flows; ask support before forcing changes on live venues.

## Plan vs Connect confusion

If your **ReserveNI subscription** invoice failed, guest payments can still succeed—fix **Plan** tab first, then re-test guest checkout separately.
`.trim(),
    },
    {
      slug: 'sms-issues',
      title: 'SMS messages not sending',
      description: 'Light plan card requirements, template toggles, guest phone numbers, and allowances.',
      tags: ['sms', 'twilio', 'communications'],
      content: `
# SMS not sending

## Checklist

1. **Template enabled?** — **Settings → Communications** lane + message card must have **SMS** ticked.
2. **Phone present?** — Guests need valid **mobile numbers** in international format where required.
3. **Plan restrictions** — **Light** appointments plans may block SMS until billing prerequisites are satisfied—read any red **banner** in Communications.
4. **Allowance** — if you exhausted included SMS, purchase/allow overage per your plan rules (see Plan tab copy).

## Delivery logs

Inspect booking **communication logs** (timeline) to see whether the app attempted send and what error text returned.

## Still stuck

Contact **Support** with approximate time, booking id, and message type so ops can trace provider logs.
`.trim(),
    },
    {
      slug: 'availability-issues',
      title: 'Slots not showing or calendar gaps',
      description: 'Opening hours vs working hours, services assigned, buffers, closures, and booking paused.',
      tags: ['availability', 'slots', 'calendar'],
      content: `
# Availability & slot gaps

## Venue vs calendars

**Business hours** define when the venue is notionally open; **calendar availability** defines when each practitioner/resource can be booked. If calendars are narrower than venue hours, guests see **gaps**.

## Services

Ensure each bookable service is **linked** to a calendar column that is actually **working** that day.

## Buffers & duration

Long **buffers** or **multi-hour** services reduce visible slots—temporarily set buffer to zero to test whether that was the cause.

## Closures

Check **closures** / **leave** blocks for the date in question.

## Booking paused

If **online booking** is paused at the venue level, the public page shows a closure message—no slots will appear regardless of hours.

## Engine edge cases

If a single practitioner is misconfigured across **two** overlapping rules, simplify to one rule set and retest.
`.trim(),
    },
    {
      slug: 'import-issues',
      title: 'Data import problems',
      description: 'Validation errors, mapping, undo window, and partial failures.',
      tags: ['import', 'csv', 'errors'],
      content: `
# Import issues

## Validation fails

Open the **validate** step, read each **row error**, fix the CSV, and re-upload. Common problems: wrong date formats, missing emails where required, illegal status values.

## Mapping

Ensure columns map to the intended ReserveNI fields—double-check **phone country** and **timezone-relative** timestamps.

## Undo

The **undo** window is time-limited—if it expired, you must manually correct bookings or run a compensating import (ask Support before destructive deletes).

## Partial completion

If execute ends in **failed** status, read the session summary and **report CSV**—often a subset imported successfully.

## Support bundles

Attach the **report CSV** and original sample (redacted) when contacting Support for fastest diagnosis.
`.trim(),
    },
    {
      slug: 'access-issues',
      title: 'Login, staff access and permissions',
      description: 'Forgotten password, staff vs admin, onboarding redirect, and session expiry.',
      tags: ['login', 'access', 'auth'],
      content: `
# Access issues

## Cannot log in

Use the **password reset** flow from the login page. Check spam folders for Supabase/auth emails.

## Staff sees “not allowed”

They may be on a **staff** role trying to open **Reports** or **Settings** tabs—only **admins** can. Ask an admin to upgrade the role if appropriate.

## Onboarding loop

If the app keeps sending you to **onboarding**, complete every required step or contact Support—sometimes a **flag** or **step index** needs correction after a plan change.

## Session timeout

Venues with strict **session timeout** may log staff out on idle tablets—re-login is expected.

## Superuser vs venue staff

Platform **superuser** routes (\`/super\`) are unrelated to day-to-day venue dashboards—do not expect venue data there unless you are internal staff.
`.trim(),
    },
  ],
};

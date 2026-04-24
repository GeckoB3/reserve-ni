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

Complete every **Connect** step in **Settings → Payments**. Stripe often needs **identity documents** or **bank verification**. Open the Stripe Dashboard from the in-app links and finish any open tasks.

## Guest payments fail

- Confirm the **booking** still exists and is in a state that allows payment.
- Check **browser** blockers and third-party cookie settings for embedded flows.
- Retry with another card to rule out issuer declines.

## Wrong Stripe account

Connect the **legal entity** that should receive guest money. Switching later means Stripe disconnect and reconnect flows. Ask **Support** before you force changes on a live venue.

## Plan vs Connect confusion

If your **ReserveNI subscription** invoice failed, guest payments might still work. Fix the **Plan** tab first, then test guest checkout again in a separate step so you know which side was blocking you.
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

1. **Template enabled?** In **Settings → Communications**, open the lane and message card and ensure **SMS** is ticked.
2. **Phone present?** Guests need a valid **mobile number** in international format where the template requires it.
3. **Plan restrictions**: **Light** appointments plans may block SMS until billing steps are done. Read any red **banner** in Communications.
4. **Allowance**: if you used your included SMS, allow overage or top up per your plan rules (see **Plan** tab copy).

## Delivery logs

Open the booking **communication** timeline to see whether the app tried to send and what error text came back.

## Still stuck

Contact **Support** with approximate time, booking id, and message type so operations can trace provider logs.
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

**Business hours** say when the venue is open in principle; **calendar availability** says when each person or resource can be booked. If calendars are narrower than venue hours, guests see **gaps**.

## Services

Check each bookable service is **linked** to a calendar column that is actually **working** that day.

## Buffers & duration

Long **buffers** or **multi-hour** services shrink visible slots. Set buffer to zero temporarily to see whether that was hiding times.

## Closures

Look for **closures** or **leave** blocks on the date you are testing.

## Booking paused

If **online booking** is paused at the venue level, the public page shows a closure message and **no slots** appear, even when hours look open.

## Engine edge cases

If one practitioner has **two** overlapping rule sets, simplify to a single clear rule set and test again.
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

Open the **validate** step, read each **row error**, fix the CSV, and upload again. Common problems: date formats, missing emails where required, or status values the mapper does not accept.

## Mapping

Map columns to the intended ReserveNI fields. Double-check **phone country** and whether dates are **timezone-relative** the way you expect.

## Undo

**Undo** is **time-limited**. If it expired, correct bookings manually or plan a compensating import. Ask **Support** before large deletes.

## Partial completion

If execute ends in **failed** status, read the session summary and **report CSV**. Often part of the file still imported.

## Support bundles

Attach the **report CSV** and a small redacted sample of the source file when you contact Support for the fastest diagnosis.
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

Use **password reset** from the login page. Check spam folders for auth emails.

## Staff sees “not allowed”

They may be **staff** trying to open **Reports** or full **Settings**. Only **admins** can. Ask an admin to change the role if that is appropriate.

## Onboarding loop

If the app keeps sending you to **onboarding**, finish every required step or contact **Support**. After a plan change, sometimes a **flag** or step index needs a correction on our side.

## Session timeout

Strict **session timeout** logs staff out on idle tablets. Signing in again is expected.

## Superuser vs venue staff

Platform **superuser** routes (\`/super\`) are not your venue dashboard. Do not expect venue data there unless you are internal ReserveNI staff.
`.trim(),
    },
  ],
};

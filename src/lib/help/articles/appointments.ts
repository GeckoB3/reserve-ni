import type { HelpCategory } from '../types';

export const appointmentsCategory: HelpCategory = {
  slug: 'appointments',
  title: 'Appointments plan',
  description: 'Pro, Plus, and Light: calendars, services, availability, classes, events, resources, and imports.',
  plan: 'appointments',
  articles: [
    {
      slug: 'overview',
      title: 'Appointments Pro, Plus and Light',
      description: 'Limits, SMS billing differences, and what “unified scheduling” means.',
      tags: ['pro', 'plus', 'light', 'limits'],
      content: `
# Appointments plans compared

## Tiers

- **Appointments Pro** (\`appointments\` in the database): **unlimited** active bookable calendars and staff seats for practical purposes used by the app’s limit checks.
- **Appointments Plus**: **up to 5** active calendars and **5** staff seats.
- **Appointments Light**: **1** active calendar column and **1** staff login; **SMS** is typically metered (pay-as-you-go) with stricter comms defaults—watch the banners in **Communications** and **Plan**.

## Product shape

“Appointments” venues use **unified scheduling** (multi-**calendar column** model) or legacy practitioner-style data that the app still surfaces through the same **Services** and **Calendar** experiences.

## Navigation labels

When you only run appointments (no secondary models), the sidebar may say **Appointments** and **New Appointment** instead of **Bookings** / **New Booking**.

## Upgrades

Use **Settings → Plan** to change tier where the product offers upgrade/downgrade paths; calendar and staff invites will start enforcing the new caps immediately after the tier updates.
`.trim(),
    },
    {
      slug: 'calendar-setup',
      title: 'Creating your bookable calendars',
      description: 'Calendar Availability → Calendars tab, services assignment, entitlements, and Plus/Light caps.',
      tags: ['calendars', 'columns', 'entitlements'],
      content: `
# Bookable calendars (columns)

Open **Calendar Availability** (\`/dashboard/calendar-availability\`) as an admin and use the **Calendars** tab.

## What you create

Each **calendar** is a bookable column on your **Appointment Calendar**—often one per staff member or room, depending on how you organise services.

## Assign services

Link **appointment services** (and optionally **class types**, **resources**, or **events**) to the correct calendar so availability and booking creation stay consistent.

## Limits

**Plus** and **Light** tiers hit **hard caps** on how many active calendars you can create. The UI uses **calendar entitlement** checks—if **Add calendar** is disabled, upgrade the plan or **deactivate** a calendar you no longer need.

## Staff visibilities

Staff users may default to the **Availability** tab for their own hours while admins manage the full **Calendars** matrix.
`.trim(),
    },
    {
      slug: 'services',
      title: 'Building your service catalogue',
      description: 'Services page: duration, price, deposits, per-service windows, colours, and staff overrides.',
      tags: ['services', 'catalogue', 'pricing'],
      content: `
# Appointment services

Go to **Services** (\`/dashboard/appointment-services\`).

## Each service

Configure **duration**, **buffer**, **price**, **deposit**, **payment requirement** (none / deposit / full payment), **colour**, **active** flag, and **sort order**.

## Booking windows

Set **per-service** advance booking range, **minimum notice**, **cancellation notice**, and **same-day** rules where applicable so fine-grained services (e.g. colour vs cut) can differ.

## Custom availability

Some services need **non-standard hours**—use the **custom availability** editor tied to the service when your template hours are not enough.

## Staff overrides

Allow or disallow **per-staff customisation** (name, description, duration, buffer, price, deposit, colour) and resolve conflicts with the **override** modal.

## Stripe

If you charge online, ensure **Stripe Connect** is ready—the UI warns when payments are expected but Connect is incomplete.
`.trim(),
    },
    {
      slug: 'working-hours',
      title: 'Working hours, breaks and closures',
      description: 'Calendar Availability tabs: availability, breaks, days off, and venue opening context.',
      tags: ['hours', 'breaks', 'leave', 'closures'],
      content: `
# Working hours and closures

Use **Calendar Availability** tabs:

## Availability

Set **weekly templates** per calendar using the working-hours editor.

## Breaks

Add **break patterns** so online slots respect lunch breaks or gaps between clients.

## Days off / closures

Mark **leave** or closed days per calendar so you are never bookable when you are not working.

## Venue context

Your **business hours** under **Settings → Business hours** still govern venue-wide opening; calendar hours should **fit inside** what you promise publicly unless your product configuration intentionally allows broader practitioner hours.

## Exceptions

Long-lived **opening exceptions** for the venue are managed alongside business hours—use them for bank holidays or one-off late openings.
`.trim(),
    },
    {
      slug: 'appointment-calendar',
      title: 'Using the Appointment Calendar',
      description: 'Day/week/month views, filters, staff booking modal, and detail sheets.',
      tags: ['calendar', 'dnd', 'booking'],
      content: `
# Appointment Calendar

Open **Appointment Calendar** (\`/dashboard/calendar\`).

## Views

Switch **day / week / month** to match how you plan. The grid respects venue opening context and your configured **grid hours**.

## Columns

Each **bookable calendar** appears as a column. Use the **column filter** to show only certain calendars—**Mine** shortcuts exist when the signed-in user manages specific calendars.

## Drag and drop

Move appointments and blocks when your permissions allow; the UI uses structured drag layers—watch validation messages if a move is illegal.

## Create bookings

Use the **staff booking** modal from a slot to add appointments on behalf of guests or walk-ins.

## Detail sheets

Open **appointments**, **class instances**, or **event instances** from the grid to see payments, messages, attendance, and status transitions in one place.
`.trim(),
    },
    {
      slug: 'managing-appointments',
      title: 'Finding, modifying and cancelling appointments',
      description: 'Bookings dashboard filters, status changes, CSV export, and bulk messaging.',
      tags: ['bookings', 'status', 'csv'],
      content: `
# Managing appointments (list)

The **Bookings** page for unified venues is tuned for **high-volume appointment operations**.

## Filters

Filter by **status**, **calendar** (practitioner/column), **service**, **booking model** when you run secondaries, **search** (name, phone, email, id), and **time-of-day** windows on a day.

## Actions

Expand cards, change **status** from the dropdown, **confirm** bookings, open the **detail sheet**, create **new** or **walk-in** bookings, and export a **CSV** for the selected custom date range.

## Bulk messaging

Select multiple bookings and send **email**, **SMS**, or **both**—the tool skips guests missing the chosen channel.

## Live connection

Watch the connection indicator—if you lose sync, refresh the page before making conflicting edits with another device.
`.trim(),
    },
    {
      slug: 'classes',
      title: 'Setting up and managing classes',
      description: 'Class types, timetable, instances, capacity, payments, and check-in.',
      tags: ['classes', 'timetable'],
      content: `
# Classes

Open **Classes** (\`/dashboard/class-timetable\`) when the **class_session** model is enabled.

## Class types

Define **name**, **description**, **duration**, **capacity**, **price**, **colour**, **instructor calendar**, **payment requirement** (none / deposit / full), deposit amounts, and **booking window** fields (advance days, minimum notice, cancellation notice, same-day toggle).

## Timetable

Add **weekly** patterns with start time, **recurrence interval**, and optional **end date** or occurrence caps.

## Instances

Browse generated **instances**, **cancel** one-off occurrences, set **capacity overrides**, and view **attendees**.

## Check-in and export

Mark **attendance**, use **CSV** helpers for rosters, and watch **Stripe** warnings when money is expected online.

## Limits

Calendar **entitlement** still applies—each class type must live on an allowed bookable calendar under your plan tier.
`.trim(),
    },
    {
      slug: 'events',
      title: 'Creating and selling event tickets',
      description: 'Experience events, ticket types, scheduling modes, and attendee CSV.',
      tags: ['events', 'tickets'],
      content: `
# Events

Open **Events** (\`/dashboard/event-manager\`) when **event_ticket** is enabled.

## Event setup

Create **experience events** with description, **start**, **capacity**, optional **image**, and assign the event to a **calendar column** for scheduling.

## Ticket types

Add multiple **ticket tiers** with **price** and optional **per-tier capacity**.

## Scheduling modes

Choose **single** date, **weekly recurrence**, or paste a **custom list of dates**—the UI parses text lists for one-off tours or festivals.

## Booking rules

Control advance booking, minimum notice, cancellation notice, same-day booking, and whether you require **deposit** or **full payment** online.

## Attendees

Track **status**, **check-in**, **cancellations**, and download **CSV** for door staff or finance.

## Search and detail

Use **search** and the **detail panel** to manage many concurrent events without losing context.
`.trim(),
    },
    {
      slug: 'resources',
      title: 'Resources and facility booking',
      description: 'Resource timeline, slot intervals, durations, and public resource flow.',
      tags: ['resources', 'facilities'],
      content: `
# Resources

Enable **resource_booking** to get **Resources** (\`/dashboard/resource-timeline\`).

## What resources are

Bookable **facilities** or **equipment** (treatment rooms, courts, studios) with their own **slot interval**, **durations**, **pricing**, and **payment** requirements.

## Timeline

Staff manage occupancy from the **resource timeline** view.

## Public booking

Guests pick a **resource**, **month**, **duration**, then an available **slot**, enter details, and pay online when required—the same Stripe rules apply as for services.

## Maintenance

Deactivate resources you temporarily remove from sale so they disappear from public lists immediately.
`.trim(),
    },
    {
      slug: 'team-management',
      title: 'Inviting staff and managing access',
      description: 'Roles, calendar assignment, plan staff caps, password reset, and session timeout.',
      tags: ['staff', 'roles', 'invite'],
      content: `
# Team management

Admins: **Settings → Staff**.

## Invites

Send invites with **email**, **name**, and **role** (**admin** vs **staff**). Staff can be linked to specific **bookable calendars** (resource-type columns are filtered out of assignable lists where applicable).

## Plan caps

**Plus** and **Light** enforce **maximum staff** counts— the add button hides when you are at cap.

## Lifecycle

**Resend** invites, **promote or demote** roles, **reset passwords** for others, and **delete** users who leave the business.

## Session timeout

Configure **venue session timeout** for shared devices on reception tablets (API-backed setting in Staff section).

## Staff experience

Non-admins land on **Account** settings for personal details only—they cannot change venue-wide policies.
`.trim(),
    },
    {
      slug: 'deposits',
      title: 'Taking deposits and full payments',
      description: 'Service-level payment requirements, Stripe Connect, and guest checkout.',
      tags: ['deposits', 'stripe', 'full payment'],
      content: `
# Deposits and full payments (appointments)

## Requirements

1. **Stripe Connect** complete (**Settings → Payments**).
2. Each **service** (or class/event/resource catalogue entry) sets **payment_requirement** appropriately.
3. **Communications** templates for deposit **request**, **confirmation**, and **reminder** if you rely on automated chasing.

## Guest checkout

Public flows show a **Stripe** step whenever money is due before confirmation.

## Staff bookings

Staff-created bookings still respect the configured requirement—collect card details when the product expects online payment.

## Refunds

Cancellation windows on services/classes/events should match what you promise in email/SMS templates to avoid disputes.
`.trim(),
    },
    {
      slug: 'communications',
      title: 'Automated reminders and confirmations',
      description: 'Appointments & other lane, message keys, SMS allowance, and previews.',
      tags: ['sms', 'email', 'reminders'],
      content: `
# Communications (appointments lane)

**Settings → Communications** loads **policies** and **templates** from \`/api/venue/communication-policies\`.

## Lane

**Appointments & other** covers appointments, classes, events, and resources. Restaurant table venues get a separate **Table bookings** lane when applicable.

## Message catalogue

Typical keys include **confirmation**, **deposit** flows, **confirm/cancel** prompts, **pre-visit reminder**, **modification**, **cancellation**, **auto-cancel**, **no-show**, **post-visit thank you**, and **custom** broadcast messages.

## Channels

Toggle **email** and **SMS** per message where the schema allows. Preview with **merge fields** via the preview API.

## SMS billing

**Plan** tab summarises included messages vs overage. **Light** appointments plans may require a saved card before SMS can send—follow in-app banners.

## Operational sends

Staff can still send **ad hoc** or **bulk** messages from booking screens when policies and contact data allow it.
`.trim(),
    },
    {
      slug: 'reports',
      title: 'Reports, appointment insights and data export',
      description: 'Team & services charts, no-show series, CSVs, and full export.',
      tags: ['reports', 'analytics', 'csv'],
      content: `
# Reports (appointments)

**Reports** remains **admin-only**.

## Range

Pick a **date range** and apply—most charts respect that window.

## Highlights for appointments

- **Summary** tiles for volume, covers/clients, and channel mix.
- **By booking type** when you run hybrid models.
- **Team, services & channels** when unified scheduling insights are available—who performed work, which services sell, which channels (online, phone, widget) drive demand.
- **No-show** and **cancellation** analyses with downloadable CSVs.

## Data export

Download **all bookings** and **all guests** from the export section for backups or Excel workflows.

## Clients tab

Deep guest editing, **tags**, and cross-model **history** live here—pair with the **Guests** shortcut route if you use it.
`.trim(),
    },
    {
      slug: 'data-import',
      title: 'Importing clients and bookings',
      description: 'Import hub, platforms, validate, review, undo window, and report CSV.',
      tags: ['import', 'csv', 'migration'],
      content: `
# Data import

**Data Import** (\`/dashboard/import\`) is **admin-only**.

## Flow

1. **Start** a new import session.
2. **Upload** CSV (or supported sources where detected—e.g. Fresha, Booksy, Vagaro style datasets when the detector recognises them).
3. **Map** columns to ReserveNI fields.
4. **Validate**—fix errors before committing.
5. **Review** counts (clients, bookings, skipped, updated).
6. **Execute** the import.

## After import

- Sessions show **status** and timestamps.
- A **Report CSV** is available for audit.
- **Undo** exists for a limited window—deleting a session does **not** automatically remove already-imported rows; use **Undo** for that.

## Hygiene

Deduplicate guests in your source file where possible; the mapper is strict about required fields to protect live data.
`.trim(),
    },
    {
      slug: 'booking-widget',
      title: 'Embedding your booking page',
      description: 'iframe URL, accent colour, tab query param, resize script, and QR.',
      tags: ['embed', 'widget', 'iframe', 'qr'],
      content: `
# Booking widget & QR

Visit **Settings → Widget** as an admin.

## iframe snippet

The snippet points to \`/embed/{venueSlug}\` with optional:

- \`?accent=RRGGBB\` (no hash) to tint buttons.
- \`?tab=appointments\` | \`tables\` | \`events\` | \`classes\` | \`resources\` to open a specific tab when the venue supports it.

## resize.js

Include the hosted **resize** script so the iframe **height** updates as guests change steps—without it, embeds may clip or scroll awkwardly.

## QR code

The QR encodes your **public** \`/book/{slug}\` page (not the embed URL) so print collateral opens the full responsive experience.

## Analytics

Widget bookings record **source = widget** so marketing can prove ROI in **Reports**.
`.trim(),
    },
  ],
};

import type { HelpCategory } from '../types';

export const restaurantCategory: HelpCategory = {
  slug: 'restaurant',
  title: 'Restaurant plan',
  description: 'Dining availability, floor plan, table grid, day sheet, waitlist, and table-focused communications.',
  plan: 'restaurant',
  articles: [
    {
      slug: 'overview',
      title: 'Restaurant plan overview and navigation',
      description: 'Who gets the restaurant product, what appears in the sidebar, and admin-only areas.',
      tags: ['restaurant', 'navigation', 'tier'],
      content: `
# Restaurant plan overview

The **Restaurant** and **Founding Partner** plans unlock the full **table reservation** product: **Dining Availability**, **Table Grid**, **Floor Plan**, and the **“Table bookings”** lane in communications.

## Navigation highlights

- **Bookings** — list and manage reservations (and other enabled models if you added them).
- **Table Grid** and **Floor Plan** — appear when **table management** is enabled; live operational views.
- **Day Sheet** — front-of-house run sheet when you are **not** using the table-management bundle; if table management is on, **Day Sheet** may redirect to **Floor Plan**.
- **Dining Availability** — **admin only**; configure services, capacity, rules, floor plan, and areas.
- **Waitlist** — only for table-reservation venues.
- **Calendar Availability** — appears when you also use schedule-backed models (appointments, classes, events, resources).

## Roles

**Staff** do not see **Reports**, **Dining Availability**, or **Data Import** in the sidebar. They still operate bookings and floor tools you grant.

## Hybrid venues

You can enable **secondary** appointment-style models; the sidebar then adds links such as **Services**, **Events**, **Classes**, or **Resources**, and your public page gains tabs. See **Appointments** help topics for those features.
`.trim(),
    },
    {
      slug: 'dining-services',
      title: 'Setting up dining services (sittings)',
      description: 'Lunch/dinner services, last booking time, and how they drive the grid and day sheet.',
      tags: ['dining', 'services', 'sittings'],
      content: `
# Dining services (sittings)

Open **Dining Availability** (\`/dashboard/availability\`) as an admin, then use the **Services** tab.

## What a “service” is

A **service** is a bookable sitting window—for example **Lunch 12:00–15:00** or **Dinner 17:30–22:00**—on the days you trade. You set **start** and **end** times and **last booking time** so the system knows when guests can still book.

## Why it matters

- **Public availability** for tables is calculated within these windows.
- **Table Grid** and **Day Sheet** columns align to your services for the selected date.

## Tips

- Add **both** lunch and dinner if you serve both; guests only see slots inside active services.
- If you change service times, double-check existing bookings on the edge of the change.
`.trim(),
    },
    {
      slug: 'booking-rules',
      title: 'Party sizes, advance booking and capacity rules',
      description: 'Min/max party, advance days, notice hours, and booking rules under Dining Availability.',
      tags: ['rules', 'capacity', 'party'],
      content: `
# Booking rules (restaurant)

Restaurant booking rules are configured under **Dining Availability** (tabs such as **Booking rules**, **Capacity rules**, and **Dining duration** depending on your capacity model).

## Typical controls

- **Minimum and maximum party size** for online bookings.
- **How far ahead** guests can book (advance days).
- **Minimum notice** before a slot (hours).
- **Large-party handling**—you may require guests to call for very large groups instead of booking online.
- **Pausing online booking** while staying open for phone bookings (when supported by your configuration).

## Deposits

Deposit behaviour for tables is tied to **deposit configuration** and dining rules—see **Deposits** in this section and **Settings → Payments** for Stripe.

## Consistency

After changing rules, spot-check your **public booking page** as a guest would see it for tonight and a date weeks ahead.
`.trim(),
    },
    {
      slug: 'floor-plan-setup',
      title: 'Designing your floor plan',
      description: 'Table Management tab, editor, tables, combinations, and adjacency.',
      tags: ['floor plan', 'tables', 'combinations'],
      content: `
# Designing your floor plan

As an admin, go to **Dining Availability → Table Management** (or **Settings → Floor plan** when linked from the product).

## Enable table management

Turn **table management** on when you are ready to assign bookings to **named tables** and use **Table Grid** / **Floor Plan**. The product may offer to seed a starter layout—review it before going live.

## Editor basics

- Place **tables** on the canvas; set shapes, seats, and names.
- Define **combinations** (joined tables) where guests can be seated across merged capacity—often with **adjacency** hints so only physically touching tables combine.
- Upload a **background image** (optional) to trace your room.

## Dining areas

If you run multiple rooms or floors as **dining areas**, maintain a **floor plan per area** where the product expects it.

Save frequently; large layouts are easier to correct incrementally than after weeks of live bookings.
`.trim(),
    },
    {
      slug: 'dining-areas',
      title: 'Managing multiple dining areas',
      description: 'Areas, colours, active flags, and public manual vs automatic area selection.',
      tags: ['areas', 'multi-room'],
      content: `
# Multiple dining areas

In **Dining Availability**, manage **dining areas** when you operate more than one bookable room (or terrace, bar area, etc.).

## For staff

- **Table Grid** and **Floor Plan** usually let you pick which **area** you are viewing.
- Filters and summaries respect the selected area.

## For guests online

You choose how guests pick an area:

- **Automatic** — availability can be merged for booking flows that support it.
- **Manual** — guests explicitly choose an area; ensure names and colours are clear.

Keep inactive areas **turned off** so they do not appear in public flows.
`.trim(),
    },
    {
      slug: 'table-grid',
      title: 'Using the Table Grid',
      description: 'Time-by-table matrix, drag moves, filters, walk-ins, blocks, and undo.',
      tags: ['table grid', 'operations', 'drag'],
      content: `
# Using the Table Grid

**Table Grid** is your live **time × table** control room for service.

## Core actions

- **Move** bookings between tables or times using drag-and-drop where enabled; invalid targets are blocked with clear validation.
- **Undo** recent moves when you make a mistake during rush.
- **Walk-in** from a cell to add a reservation on the fly.
- **Blocks** — place holds on tables (e.g. reserved for VIP, broken table) with optional repeat patterns.

## Filters and search

Filter by **zone**, **status**, **cancelled/no-show**, and **free text** to find a booking quickly.

## Combinations

When tables are **combined**, the grid reflects merged capacity according to your floor plan rules and **combination threshold** settings.

## Live updates

The view refreshes with **live sync** so the floor team stays aligned—still confirm critical moves verbally during service.
`.trim(),
    },
    {
      slug: 'floor-plan-live',
      title: 'Using the live Floor Plan',
      description: 'Visual layout vs grid; link to edit layout from Dining Availability.',
      tags: ['floor plan', 'visual'],
      content: `
# Live Floor Plan

The **Floor Plan** page shows a **visual map** of tables for the selected **dining area**—ideal for hosts who think spatially.

## Compared to Table Grid

- **Grid** — time schedule and precision moves.
- **Floor Plan** — at-a-glance layout and status across the room.

## Editing the layout

Admins can jump to **Dining Availability → Table Management** (or the linked floor plan editor) to adjust positions, combinations, and table metadata.

Use the same **area** selector as the grid when you have multiple rooms.
`.trim(),
    },
    {
      slug: 'day-sheet',
      title: 'Using the Day Sheet',
      description: 'Service-period columns, capacity, dietary summary, and when Day Sheet replaces floor tools.',
      tags: ['day sheet', 'foh'],
      content: `
# Day Sheet

The **Day Sheet** is a **front-of-house service sheet** organised by **service period** (lunch/dinner) with capacity, covers, and per-booking cards.

## When you see it

If **table management** is **off**, Day Sheet is your primary operational schedule view alongside **Bookings**. If table management is **on**, the app may **redirect** Day Sheet to **Floor Plan**—use Grid/Floor tools instead.

## Features

- **Capacity** per period and **covers remaining**.
- **Dietary summary** with allergy-style highlighting for quick briefing.
- **Status chips** and **search** to filter the board.
- **Guest row** expansion: visit counts, **tags**, **table assignment**, **attendance**, **notes**, and **messaging** (email/SMS depending on configuration).
- **Polling** keeps the page reasonably fresh—still refresh manually before service if you need certainty.

## Best practice

Assign **tables** early, confirm **attendance**, and use **internal notes** for handover between shifts.
`.trim(),
    },
    {
      slug: 'managing-reservations',
      title: 'Finding, modifying and cancelling reservations',
      description: 'Bookings dashboard views, detail panel, table selector, messaging, and bulk tools.',
      tags: ['bookings', 'modify', 'cancel'],
      content: `
# Managing reservations

Use **Bookings** for calendar/list views across a day, week, or month.

## Detail panel

Open a booking to see **guest profile**, **communications log**, **table assignments**, **dietary** and **occasion** fields, **deposits**, **internal notes**, and **modify** flows.

## Table changes

Use the **table selector** with **day occupancy** hints to avoid double-booking a table.

## Messaging

Send **SMS/email** from the booking where channels are enabled. **Admins** can use **bulk guest messaging** for a selected set of bookings (respect opt-out and channel availability).

## Status workflow

Move bookings through your operational statuses (booked, confirmed, seated, completed, etc.) according to your house rules and any **no-show grace** configured on the venue.
`.trim(),
    },
    {
      slug: 'waitlist',
      title: 'Managing the waitlist',
      description: 'Queue, statuses, and when the waitlist appears in the sidebar.',
      tags: ['waitlist', 'queue'],
      content: `
# Waitlist

The **Waitlist** appears for **table reservation** venues.

## Typical workflow

Guests (or staff) join a **queue** when you are full. Entries move through states such as **waiting**, **offered**, **confirmed**, **expired**, and **cancelled** depending on your process.

## Operations

- Review the list frequently during peak service.
- When a table frees, **offer** slots fairly and confirm quickly so guests do not expire.

## Configuration

Ensure your **booking rules** and **communications** reflect how you want waitlisted guests to be contacted when a table becomes available.
`.trim(),
    },
    {
      slug: 'deposits',
      title: 'Taking deposits from guests',
      description: 'Venue deposit_config, dining rules, and the guest Stripe payment step.',
      tags: ['deposits', 'stripe', 'payments'],
      content: `
# Deposits (restaurant)

Deposits combine three things:

1. **Stripe Connect** must be ready (**Settings → Payments**).
2. **Deposit rules** on the venue / dining configuration (amount per person, online vs phone, minimum party size, weekend-only options—exact fields depend on your schema version).
3. **Communications** templates for **deposit request**, **confirmation**, and **reminder** where you use them.

## Guest experience

On the public flow, when a slot requires a deposit, guests complete a **Stripe** step before the booking is confirmed.

## Staff-created bookings

Staff flows respect the same payment requirements when guests pay online; phone bookings may follow different rules if you enabled that split.

## Refunds and cancellations

Cancellation **hours** affect whether automatic refund messaging applies—align your policy text in templates with what you enforce in-house.
`.trim(),
    },
    {
      slug: 'communications',
      title: 'Automated guest communications (tables)',
      description: 'Table bookings lane, message types, channels, timing, and previews.',
      tags: ['sms', 'email', 'templates'],
      content: `
# Communications (table bookings lane)

Open **Settings → Communications**.

## Lanes

Restaurant/founding venues see the **“Table bookings”** lane separately from **“Appointments & other”** when both apply.

## Message types

Examples include **confirmation**, **deposit** request/confirmation/**reminder**, **confirm or cancel** prompt, **pre-visit reminder**, **modification**, **cancellation**, **auto-cancel**, **no-show** (email where used), **post-visit thank you**, and **custom** staff messages.

## Channels and timing

Each message can use **email** and/or **SMS** (subject to plan and template). Timed messages support **hours before** or **after** the booking.

## Preview

Use **preview** to sanity-check merge fields and tone before switching things on for live traffic.

## SMS allowance

Non-Light plans typically include a monthly **SMS bundle** with overage rates shown in **Plan**; **Light** uses metered SMS—read the banner in Communications if you are on Light appointments (not restaurant tier, but included here for completeness if you ever see similar copy).
`.trim(),
    },
    {
      slug: 'reports',
      title: 'Reports, table utilisation and data export',
      description: 'Overview charts, table utilisation CSV, per-report exports, and full venue export.',
      tags: ['reports', 'csv', 'analytics'],
      content: `
# Reports (restaurant)

**Reports** is **admin-only**.

## Overview tab

Pick a **date range**, then review charts for **sources**, **status**, **covers**, **no-shows**, **cancellations**, and **deposits**. When you run **multiple booking types**, you will see **per-model** summaries.

## Table utilisation

When **table management** is enabled, use the **table utilisation** report to see **percentage utilisation** per table and download **CSV** for analysis (occupied vs available hours).

## Exports

Many widgets offer a **CSV** download for the chart in view.

## Full export

Use **Data export** on the reports page to download **all bookings** and **all guests** for the venue (not limited to the report date range)—ideal for backups and spreadsheets.

## Clients tab

Switch to **Clients** for a CRM-style guest list with tags, edits, and history—also linked from \`/dashboard/guests\` redirect.
`.trim(),
    },
  ],
};

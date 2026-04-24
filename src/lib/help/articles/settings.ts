import type { HelpCategory } from '../types';

export const settingsCategory: HelpCategory = {
  slug: 'settings',
  title: 'Settings & account',
  description:
    'Settings tabs, business hours, staff, billing, guest records, and exports. Shared across plans.',
  plan: 'all',
  articles: [
    {
      slug: 'overview',
      title: 'Settings overview',
      description: 'Admin tabs vs staff account-only mode and deep links (widget, floor plan).',
      tags: ['settings', 'admin', 'staff'],
      content: `
# Settings overview

## Admins

**Settings** (\`/dashboard/settings\`) includes:

- **Profile**: your personal login block, **venue profile**, **booking types**, contextual booking rules, and the widget card where shown.
- **Business hours**: weekly **opening hours** plus **closures** and special blocks.
- **Plan**: subscription status, SMS usage, cancel, resume, and upgrade flows.
- **Payments**: **Stripe Connect** onboarding.
- **Communications**: automated templates and policies.
- **Staff**: invites and roles.
- **Data import**: shortcut into the import wizard.

## Staff (non-admin)

Staff who open **Settings** only see **Account**: name, email, phone, and password. They do not see venue-wide tabs.

## Related pages (still part of setup)

- **Settings → Widget**: embed snippet and QR code.
- **Settings → Floor plan / Tables**: advanced table geometry for restaurant setups.

Use the sidebar **Help** link when you forget which tab holds a control.
`.trim(),
    },
    {
      slug: 'business-hours',
      title: 'Business hours and special closures',
      description: 'Opening hours editor, closures, and venue exceptions.',
      tags: ['hours', 'closures', 'exceptions'],
      content: `
# Business hours & closures

## Weekly hours

**Settings → Business hours** opens the **opening hours** editor. Set open and close windows per weekday so they match real kitchen and service capacity.

## Closures & special blocks

The same area includes **closures** and special-day tools:

- Mark days **closed**.
- Set **amended hours** (late open, early close).
- Use **reduced capacity** or **special events** when your editor offers those block types.

Restaurant venues may show extra block types. Read the short help next to each control in the app.

## Venue timezone

Set **timezone** in **Profile** (venue section) so closures and reminders match your wall clock.

## After changes

Spot-check **public availability** for today and a future bank holiday after each change.
`.trim(),
    },
    {
      slug: 'staff-accounts',
      title: 'Staff accounts, roles and permissions',
      description: 'Admin vs staff, invites, calendar links, and what staff cannot see.',
      tags: ['staff', 'roles', 'permissions'],
      content: `
# Staff accounts

## Roles

- **Admin**: full access to financial settings, communications, imports, reports, dining availability, and staff invites.
- **Staff**: day-to-day booking work the UI allows for their role. **No** venue-wide settings.

## Inviting

Admins create invites from **Settings → Staff**. Staff accept the email and set a password (exact steps can vary slightly with your auth setup).

## Calendar assignment

Link each staff user to the **bookable calendars** they work in so **Appointment Calendar** shows the right **Mine** columns.

## Security

Use **session timeout** on shared tablets and **reset passwords** promptly when someone leaves.

## Support escalation

Staff should use **Support** or ask an admin when a screen is missing. The UI usually hides actions they cannot use instead of failing halfway through a task.
`.trim(),
    },
    {
      slug: 'plan-billing',
      title: 'Managing your plan and billing',
      description: 'Plan tab, SMS counters, cancel/resume, Light PAYG, and checkout return query params.',
      tags: ['billing', 'subscription', 'sms'],
      content: `
# Plan & billing

Open **Settings → Plan**.

## What you see

- Current **tier** name.
- **Subscription status** (active, trialing, past due, cancelling, cancelled).
- **Billing period** end date from Stripe.
- **SMS usage**: included allowance vs metered usage, depending on tier.

## Actions

- **Cancel**, **resume**, or **resubscribe** according to your state.
- **Light** may show upgrade paths or card update prompts.
- After Stripe checkout returns, query params such as \`?upgraded=1\` can show confirmation banners. Read them before you navigate away.

## Distinction

This page is **only** your ReserveNI subscription. **Guest payments** stay under **Stripe Connect** in **Payments**.
`.trim(),
    },
    {
      slug: 'guest-management',
      title: 'Your guest database and client records',
      description: 'Reports → Clients, tags, visit counts, booking history, and booking detail notes.',
      tags: ['guests', 'crm', 'tags'],
      content: `
# Guest / client management

## List & search

**Reports → Clients** (or \`/dashboard/guests\`) gives admins a searchable guest list with **sorting**, **tag filters**, and pagination.

## Detail

Open a guest to edit **contact fields**, maintain **tags** for segments, and review **booking history** across models (tables, appointments, events, and so on, depending on your venue).

## From a booking

Booking detail panels let you adjust **tags** and **internal customer notes** without leaving the operational flow.

## Responsible use

Guest records can track visits, no-shows, and how identifiable the profile is. Use the fields honestly (for example, do not mark a walk-in as fully marketing-consented without proper consent).

## Marketing compliance

Send bulk campaigns only when you have a lawful basis under your own policies. ReserveNI supplies tooling; it does not provide legal advice.
`.trim(),
    },
    {
      slug: 'data-export',
      title: 'Exporting all your data',
      description: 'Full bookings and guest CSV exports from Reports and import session reports.',
      tags: ['export', 'csv', 'backup'],
      content: `
# Exporting all your data

## Full CSV exports

In **Reports → Data export**, download:

- **All bookings** CSV for the venue history the export API covers.
- **All guests / clients** CSV for CRM or backup use.

These exports are **not** limited to the charts’ date filter.

## Per-report CSVs

Individual charts (such as utilisation or appointment insights) include their own **Download CSV** actions for focused analysis.

## Import session reports

After **Data Import**, download the per-session **report CSV** to audit what changed.

## Security

Store downloaded CSVs securely. They can contain personal data and payment references depending on columns.
`.trim(),
    },
  ],
};

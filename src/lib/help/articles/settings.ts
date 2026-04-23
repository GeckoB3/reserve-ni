import type { HelpCategory } from '../types';

export const settingsCategory: HelpCategory = {
  slug: 'settings',
  title: 'Settings & account',
  description: 'Settings tabs, business hours, staff, billing, guests, and exports—shared across plans.',
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

- **Profile** — personal login block + **venue profile** + **booking types** + contextual booking rules / widget card.
- **Business hours** — weekly **opening hours** plus **closures / special blocks**.
- **Plan** — subscription status, SMS usage, cancel/resume/upgrade flows.
- **Payments** — **Stripe Connect** onboarding.
- **Communications** — automated templates/policies.
- **Staff** — invites and roles.
- **Data import** — shortcut card to the import wizard.

## Staff (non-admin)

Staff opening **Settings** only see **Account** — name, email, phone, password—no venue-wide tabs.

## Related pages (still “settings area”)

- **Settings → Widget** — embed + QR.
- **Settings → Floor plan / Tables** — advanced table geometry (restaurant contexts).

Use the sidebar **Help** link (this site) when you forget which tab holds a control.
`.trim(),
    },
    {
      slug: 'business-hours',
      title: 'Business hours and special closures',
      description: 'OpeningHoursControl, closures editor, and venue exceptions.',
      tags: ['hours', 'closures', 'exceptions'],
      content: `
# Business hours & closures

## Weekly hours

**Settings → Business hours** opens the **opening hours** editor. Configure open/close windows per weekday; keep times realistic for your kitchen and service model.

## Closures & special blocks

The same area includes **closures** / special-day tooling:

- Mark days **closed**.
- **Amended hours** (late opening, early close).
- **Reduced capacity** or **special events** when your editor exposes those block types.

Restaurant venues may see additional block semantics—read the inline help next to each control.

## Venue timezone

Set the **timezone** in **Profile** (venue section) so closures and reminders align with your wall clock.

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

- **Admin** — full financial, communications, imports, reports, dining availability, staff invites.
- **Staff** — day-to-day booking operations permitted by your configured UI; **no** venue-wide settings.

## Inviting

Admins create invites from **Settings → Staff**. Staff must accept the email and set a password (flows may vary slightly by auth configuration).

## Calendar assignment

Link each staff user to the **bookable calendars** they should manage so the **Appointment Calendar** filter shows the right **Mine** columns.

## Security

Use **session timeout** on shared tablets and **reset passwords** promptly when someone leaves.

## Support escalation

Staff should use **Support** or ask an admin when blocked by permissions—the UI hides buttons they cannot use rather than erroring mid-action.
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

- Current **tier** display name.
- **Subscription status** (active, trialing, past due, cancelling, cancelled).
- **Billing period** end date from Stripe fields.
- **SMS usage** — included allowance vs metered usage depending on tier.

## Actions

- **Cancel**, **resume**, or **resubscribe** according to your state.
- **Light-specific** flows may include upgrade to Pro or card update prompts.
- After Stripe checkout returns, query params such as \`?upgraded=1\` show confirmation banners—read them before navigating away.

## Distinction

This page is **only** for your ReserveNI subscription. Guest payments remain under **Stripe Connect** in **Payments**.
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

**Reports → Clients** (or \`/dashboard/guests\` redirect) gives admins a searchable guest list with **sorting**, **tag filters**, and pagination.

## Detail

Expand a guest to edit **contact fields**, maintain **tags** for segmentation, and review **cross-model booking history** (tables + appointments + events, etc., depending on your venue).

## From a booking

Inside booking detail panels you can adjust **tags** and **internal customer notes** without leaving the operational workflow.

## API-backed behaviour

Guest records track visit counts, no-show counts, and identifiability tiers—use the UI truthfully (e.g. do not mark anonymous walk-ins as full marketing consented profiles without paperwork).

## Marketing compliance

Only send bulk campaigns when you have legitimate interest or consent per your policies—ReserveNI provides tooling, not legal advice.
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

Within **Reports → Data export** (section on the reports page), download:

- **All bookings** CSV across the whole venue history handled by the export API.
- **All guests / clients** CSV for CRM or backup use.

These exports are **not** limited to the charts’ date filter.

## Per-report CSVs

Individual charts (such as utilisation or appointment insights) include their own **Download CSV** actions for focused analysis.

## Import session reports

After **Data Import**, download the per-session **report CSV** for auditing what changed.

## Security

Store downloaded CSVs securely—they contain PII and payment references depending on columns.
`.trim(),
    },
  ],
};

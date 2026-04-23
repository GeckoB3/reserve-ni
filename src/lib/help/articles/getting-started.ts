import type { HelpCategory } from '../types';

export const gettingStartedCategory: HelpCategory = {
  slug: 'getting-started',
  title: 'Getting started',
  description: 'First steps after signup: dashboard, profile, payments, and your public booking page.',
  plan: 'all',
  articles: [
    {
      slug: 'welcome',
      title: 'Welcome to ReserveNI',
      description: 'What ReserveNI is, who it is for, and how the dashboard fits together.',
      tags: ['overview', 'basics'],
      content: `
# Welcome to ReserveNI

ReserveNI is an all-in-one booking platform for Northern Ireland hospitality and appointment businesses. You run day-to-day operations from the **dashboard**; your customers book online through your **public booking page** (and optional **website embed**).

## What you can do

- Take **table reservations**, **appointments**, **classes**, **ticketed events**, or **resource** bookings—depending on your plan and the booking types you enable.
- Collect **deposits and full payments** through **Stripe Connect** (money goes to your connected account).
- Automate **email and SMS** messages (confirmations, reminders, deposit prompts, and more).
- See **reports**, export data, and (on appointment plans) **import** clients and bookings from other systems.

## Plans at a glance

- **Restaurant** or **Founding Partner**: full **dining** and **table management** experience (floor plan, table grid, dining availability).
- **Appointments Pro / Plus / Light**: **calendars**, **services**, and schedule tools. **Light** and **Plus** have limits on active calendars and staff accounts—see the Appointments section of this help centre.

## Where to go next

1. Complete **onboarding** if you have not finished it (the app will guide you).
2. Open **Settings** to finish **profile**, **business hours**, and **Stripe**.
3. Use the **setup checklist** on Home to see what is still missing before you go live.

If you are stuck, use **Support** in the sidebar or read the **Troubleshooting** articles in this help centre.
`.trim(),
    },
    {
      slug: 'dashboard-overview',
      title: 'Your dashboard at a glance',
      description: 'Home, navigation, admin vs staff, and how labels change with your booking model.',
      tags: ['dashboard', 'navigation', 'roles'],
      content: `
# Your dashboard at a glance

## Home

**Home** (\`/dashboard\`) shows today’s snapshot: bookings, alerts, and a **setup checklist** (admins) so you can see what still needs configuration before guests can book smoothly.

## Left sidebar

The sidebar lists everything you can open in the app. Which links appear depends on:

- Your **role** (**Admin** sees Reports, Dining Availability, Data Import, and full Settings; **Staff** see a slimmer menu and **Account** instead of full Settings).
- Your **booking model** (for example table reservations vs unified appointments).
- Your **plan** (Restaurant/Founding vs Appointments tiers).
- Whether **table management** is enabled (adds **Table Grid** and **Floor Plan**; **Day Sheet** may redirect when table management is on).

Labels such as **Bookings** vs **Appointments** and **New Booking** vs **New Appointment** change automatically based on your enabled models and terminology.

## Your booking page

When your venue has a **slug**, the sidebar includes **Your Booking Page**—a link to the public URL guests use to book online.

## Support

Use **Support** to message the ReserveNI team from inside the app.
`.trim(),
    },
    {
      slug: 'business-profile',
      title: 'Setting up your business profile',
      description: 'Venue name, address, slug, timezone, imagery, and restaurant-specific fields.',
      tags: ['settings', 'profile', 'venue'],
      content: `
# Setting up your business profile

Go to **Settings → Profile** (admins).

## Everyone

- **Venue name** and **contact details** (phone, email, website).
- **Address**—used on your public page and in communications.
- **Venue slug**—this becomes your public URL (\`/book/your-slug\`). Pick something short and memorable; changing it later will break old links.
- **Timezone**—used for reminders, availability, and “today” in the dashboard. Defaults to UK-friendly settings; adjust if you trade in Ireland with different opening patterns.

## Cover and branding

Upload a **cover image** where offered so your public booking page looks professional.

## Restaurant venues

You may also set fields such as **cuisine type**, **price band**, **kitchen email** (for operational notifications), and **no-show grace** (how long you wait before treating a late guest as a no-show in the UI—check your own policy).

## Booking types (appointments plans)

On **Appointments** plans you can enable **secondary** models (events, classes, resources) from the same profile area so guests see extra tabs on your public page. Only enable what you actively sell.

## Booking rules

Depending on your model, **booking rules** (party sizes, notice windows, etc.) may appear under Profile or under **Dining Availability**—see the Restaurant or Appointments articles for your case.
`.trim(),
    },
    {
      slug: 'stripe-payments',
      title: 'Connecting Stripe to take payments',
      description: 'Stripe Connect for guest charges vs your ReserveNI subscription.',
      tags: ['stripe', 'payments', 'deposits'],
      content: `
# Connecting Stripe to take payments

There are **two** different Stripe relationships in ReserveNI:

## 1. Your ReserveNI subscription

Under **Settings → Plan** you manage your **ReserveNI plan** (billing for the product itself). That is separate from guest payments.

## 2. Stripe Connect (guest money)

Under **Settings → Payments**, connect **Stripe Connect** so you can take **deposits** and **online payments** from guests. Onboarding is step-by-step (business details, bank account, identity verification as required by Stripe).

Until Connect is **enabled**, guests may be unable to pay online even if you have turned on deposits in your rules.

### Tips

- Use a **business** Stripe account that matches your legal entity.
- If Connect shows **restricted** or **pending**, open the Stripe Dashboard from their links and resolve any requested information.
- Only **admins** can complete Connect; staff will see guidance to ask an admin.

After Connect works, configure **deposit rules** in dining or service settings (see **Deposits** in your plan’s help section).
`.trim(),
    },
    {
      slug: 'public-booking-page',
      title: 'Your public booking page and QR code',
      description: 'How guests book online, tabs for multiple models, embed, and QR from Settings → Widget.',
      tags: ['public', 'embed', 'widget', 'qr'],
      content: `
# Your public booking page and QR code

Your guests book at **\`/book/{your-venue-slug}\`** (and optionally **\`/book/{slug}/{practitioner-slug}\`** for a specific calendar on appointment setups).

## What guests see

- Your **branding**, address, phone, and **opening hours** (when configured).
- If **online booking is paused**, they see a clear message to contact you by phone.
- If you run **more than one booking type** (for example tables **and** events), they see **tabs** to switch between experiences.

## Dining areas (tables)

With **multiple dining areas**, you can control whether guests pick an area **manually** or you **merge** availability—configured where you manage dining areas and public booking mode.

## Widget and QR

Under **Settings → Widget** (admin):

- Copy the **iframe embed** snippet to put booking on your own website. Optional **accent** colour query string tints the experience.
- Download a **QR code** that opens your **full booking page** (not the embed URL)—ideal for menus, posters, and reception.

## Source tracking

Bookings created via the embed are tracked so you can see **widget** as a source in reports.
`.trim(),
    },
    {
      slug: 'setup-checklist',
      title: 'Completing your setup checklist',
      description: 'The checklist on Home tracks profile, availability, Stripe, first booking, and more.',
      tags: ['checklist', 'onboarding', 'home'],
      content: `
# Completing your setup checklist

On **Home**, admins see a **setup checklist** that tracks practical readiness:

- **Profile** complete (business details, slug, imagery as required).
- **Availability** configured so guests can see real slots.
- **Guest booking ready**—the app checks that the combination of rules, Stripe, and catalogues is coherent enough to accept online bookings.
- **Stripe Connect** connected when you expect online payments.
- **First booking** (optional milestone).
- Extra flags if you use **events**, **classes**, or **resources** so those catalogues are not empty.

## Dismissal

You can dismiss the card for the current browser session once steps are complete; it also respects completion flags from the server.

## If something stays red

Open each linked area (Settings, Dining Availability, Calendar Availability, Services, etc.) and fix the highlighted gap—usually missing hours, missing Connect, or no services/sittings yet.
`.trim(),
    },
  ],
};

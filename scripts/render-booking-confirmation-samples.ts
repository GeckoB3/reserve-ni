/**
 * Renders policy-based booking confirmation emails (same as production) for each
 * booking model. Run: npx tsx scripts/render-booking-confirmation-samples.ts
 * Opens: scripts/output/booking-confirmation-samples.html
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { renderCommunicationEmail } from '@/lib/communications/renderer';
import type { BookingEmailData, VenueEmailData } from '@/lib/emails/types';

const venue: VenueEmailData = {
  name: 'Harbour House (demo venue)',
  address: '42 Maritime Road, Belfast BT1 2XY',
  phone: '028 9000 0100',
  booking_page_url: 'https://www.reserveni.com/book/harbour-house',
};

const manage = 'https://www.reserveni.com/m/demo-manage-link';

function escapePre(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
}

/** Attribute-safe embedding for iframe srcdoc (full email HTML document). */
function escapeSrcdocAttr(html: string): string {
  return html.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

function wrapSection(
  title: string,
  subtitle: string,
  subject: string,
  html: string,
  textExcerpt: string,
): string {
  return `<section style="margin:0 0 56px 0;padding-bottom:40px;border-bottom:2px solid #cbd5e1">
<h2 style="font-family:system-ui,sans-serif;font-size:20px;margin:0 0 6px 0;color:#0f172a">${title}</h2>
<p style="font-family:system-ui,sans-serif;font-size:14px;color:#64748b;margin:0 0 6px 0">${subtitle}</p>
<p style="font-family:system-ui,sans-serif;font-size:13px;color:#334155;margin:0 0 20px 0"><strong>Subject:</strong> ${subject.replace(/</g, '&lt;')}</p>
<iframe title="${title.replace(/"/g, '&quot;')}" style="width:100%;min-height:720px;border:1px solid #cbd5e1;border-radius:12px;background:#fff" srcdoc="${escapeSrcdocAttr(html)}"></iframe>
<pre style="font-family:ui-monospace,monospace;font-size:11px;color:#475569;white-space:pre-wrap;margin:16px 0 0 0;padding:12px;background:#f1f5f9;border-radius:8px">Plain-text excerpt (first ~22 lines):\n\n${escapePre(textExcerpt)}</pre>
</section>`;
}

const samples: Array<{
  title: string;
  subtitle: string;
  lane: 'table' | 'appointments_other';
  booking: BookingEmailData;
}> = [
  {
    title: 'Model A — Table reservation',
    subtitle: 'Communication lane: table · Covers / restaurant',
    lane: 'table',
    booking: {
      id: 'sample-table-1',
      guest_name: 'Sarah Connor',
      guest_email: 'sarah@example.com',
      booking_date: '2026-06-14',
      booking_time: '19:30',
      party_size: 4,
      special_requests: 'Window table if possible',
      dietary_notes: 'One vegetarian, one gluten-free',
      deposit_status: 'Paid',
      deposit_amount_pence: 4000,
      refund_cutoff: '2026-06-12T19:30:00.000Z',
      manage_booking_link: manage,
    },
  },
  {
    title: 'Model B — Practitioner appointment',
    subtitle: 'Legacy staff + appointment_services anchors',
    lane: 'appointments_other',
    booking: {
      id: 'sample-practitioner-1',
      guest_name: 'Alex Morgan',
      guest_email: 'alex@example.com',
      booking_date: '2026-06-21',
      booking_time: '10:00',
      party_size: 1,
      booking_model: 'practitioner_appointment',
      email_variant: 'appointment',
      appointment_service_name: 'Initial consultation (45 min)',
      practitioner_name: 'Dr. Jordan Smith',
      appointment_price_display: '£65.00 (pay at venue)',
      deposit_status: 'Not Required',
      manage_booking_link: manage,
    },
  },
  {
    title: 'Model B — Unified scheduling (USE)',
    subtitle: 'calendar_id + service_item — host name on “With” row',
    lane: 'appointments_other',
    booking: {
      id: 'sample-use-1',
      guest_name: 'Riley Chen',
      guest_email: 'riley@example.com',
      booking_date: '2026-07-03',
      booking_time: '14:00',
      party_size: 1,
      booking_model: 'unified_scheduling',
      email_variant: 'appointment',
      appointment_service_name: 'Colour & balayage',
      practitioner_name: 'Studio North — colour calendar',
      appointment_price_display: '£120.00 (pay at venue)',
      deposit_status: 'Not Required',
      manage_booking_link: manage,
    },
  },
  {
    title: 'Model C — Event ticket',
    subtitle: 'experience_events + ticket line breakdown',
    lane: 'appointments_other',
    booking: {
      id: 'sample-event-1',
      guest_name: 'Jamie Patel',
      guest_email: 'jamie@example.com',
      booking_date: '2026-08-09',
      booking_time: '18:00',
      party_size: 2,
      booking_model: 'event_ticket',
      email_variant: 'appointment',
      appointment_service_name: 'Summer supper club',
      practitioner_name: null,
      appointment_price_display: '£50.00',
      booking_total_price_pence: 5000,
      booking_ticket_price_lines: [
        { label: 'Adult', quantity: 2, unit_price_pence: 2500 },
      ],
      deposit_status: 'Not Required',
      manage_booking_link: manage,
    },
  },
  {
    title: 'Model D — Class session',
    subtitle: 'Per-seat × party_size when enriched from class_types.price_pence',
    lane: 'appointments_other',
    booking: {
      id: 'sample-class-1',
      guest_name: 'Taylor Reed',
      guest_email: 'taylor@example.com',
      booking_date: '2026-06-28',
      booking_time: '09:30',
      party_size: 2,
      booking_model: 'class_session',
      email_variant: 'appointment',
      appointment_service_name: 'Vinyasa flow — morning',
      practitioner_name: null,
      appointment_price_display: '£24.00',
      booking_unit_price_pence: 1200,
      booking_price_quantity: 2,
      booking_total_price_pence: 2400,
      deposit_status: 'Paid',
      deposit_amount_pence: 2400,
      refund_cutoff: '2026-06-27T09:30:00.000Z',
      manage_booking_link: manage,
    },
  },
  {
    title: 'Model E — Resource booking',
    subtitle: 'venue_resources — duration × price per slot (total shown)',
    lane: 'appointments_other',
    booking: {
      id: 'sample-resource-1',
      guest_name: 'Chris Bell',
      guest_email: 'chris@example.com',
      booking_date: '2026-07-12',
      booking_time: '16:00',
      party_size: 1,
      booking_model: 'resource_booking',
      email_variant: 'appointment',
      appointment_service_name: 'Tennis court 1',
      practitioner_name: 'Riverside Sports Club',
      appointment_price_display: '£40.00 (pay at venue)',
      booking_total_price_pence: 4000,
      deposit_status: 'Not Required',
      manage_booking_link: manage,
    },
  },
];

const outDir = join(process.cwd(), 'scripts', 'output');
mkdirSync(outDir, { recursive: true });

let body = '';
for (const s of samples) {
  const rendered = renderCommunicationEmail({
    lane: s.lane,
    messageKey: 'booking_confirmation',
    booking: s.booking,
    venue,
  });
  if (!rendered) {
    body += `<p>Skipped (disabled): ${s.title}</p>`;
    continue;
  }
  const textHead = rendered.text.split('\n').slice(0, 22).join('\n');
  body += wrapSection(s.title, s.subtitle, rendered.subject, rendered.html, textHead);
}

const full = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Booking confirmation samples — all models</title>
  <style>body{margin:0;padding:32px 24px 80px;background:#e8eef4;font-family:system-ui,sans-serif}</style>
</head>
<body>
<h1 style="font-size:26px;margin:0 0 8px 0">Booking confirmation emails (test render)</h1>
<p style="color:#64748b;max-width:720px;line-height:1.5;margin:0 0 32px 0">
  Generated with <code>renderCommunicationEmail</code> (same path as live outbound mail). Table model uses the <strong>table</strong> lane; all others use <strong>appointments_other</strong>.
</p>
${body}
</body>
</html>`;

const outPath = join(outDir, 'booking-confirmation-samples.html');
writeFileSync(outPath, full, 'utf8');
console.log('Wrote', outPath);

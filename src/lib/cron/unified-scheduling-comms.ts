/**
 * Unified scheduling scheduled comms (`booking_model === unified_scheduling`).
 *
 * §4.2 message-type audit (unified vs legacy cron split):
 * - **Confirmation** — transactional: `send-templated` + booking create / payment webhooks (not this cron).
 * - **Deposit request / deposit confirmation** — same shared paths as confirmation (not this cron).
 * - **Reschedule** — `booking_modification_*` in `send-templated.ts` (not this cron).
 * - **Cancellation** — `cancellation_*` in `send-templated.ts` (not this cron).
 * - **Reminder 1 / 2** — **this file** (`reminder_1_email` / `reminder_1_sms` / `reminder_2_sms`). Legacy restaurants use
 *   `send-communications/route.ts` 56h + day-of paths, which **skip** unified venues (`isUnifiedSchedulingVenue`).
 * - **No-show** — staff-driven status + optional `no_show_notification` via `CommunicationService` (not scheduled here).
 * - **Post-visit** — **this file** (email). Legacy post-visit in `send-communications` skips unified venues.
 *
 * SMS segments: `sendSmsWithSegments` prefers Twilio `numSegments`, else GSM/UCS-2 estimate (plan §4.6).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getVenueNotificationSettings } from '@/lib/notifications/notification-settings';
import { getCommSettings } from '@/lib/communications/service';
import { venueLocalDateTimeToUtcMs, formatYmdInTimezone, addDaysToYmd } from '@/lib/venue/venue-local-clock';
import { logToCommLogs } from '@/lib/communications/service';
import { sendEmail } from '@/lib/emails/send-email';
import { sendSmsWithSegments } from '@/lib/emails/send-sms';
import { isSmsAllowed } from '@/lib/tier-enforcement';
import { createBookingHmac } from '@/lib/short-manage-link';
import { enrichBookingEmailForAppointment } from '@/lib/emails/booking-email-enrichment';
import type { BookingEmailData, VenueEmailData } from '@/lib/emails/types';
import { renderReminder56h } from '@/lib/emails/templates/reminder-56h';
import { renderDayOfReminderSms } from '@/lib/emails/templates/day-of-reminder-sms';
import { renderPostVisitEmail } from '@/lib/emails/templates/post-visit';
import { recordOutboundSms } from '@/lib/sms-usage';
import { normalizePublicBaseUrl } from '@/lib/public-base-url';

const TOLERANCE_MS = 15 * 60 * 1000;

const UNIFIED_BOOKING_SELECT =
  'id, venue_id, guest_id, guest_email, booking_date, booking_time, booking_end_time, party_size, special_requests, dietary_notes, deposit_amount_pence, deposit_status, cancellation_deadline, status, reminder_sent_at, final_reminder_sent_at, post_visit_sent_at, calendar_id, guest:guests(name, email, phone)';

interface GuestInfo {
  name: string | null;
  email: string | null;
  phone: string | null;
}

interface BookingRow {
  id: string;
  venue_id: string;
  guest_id: string;
  guest_email: string | null;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
  party_size: number;
  special_requests: string | null;
  dietary_notes: string | null;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
  cancellation_deadline: string | null;
  status: string;
  reminder_sent_at: string | null;
  final_reminder_sent_at: string | null;
  post_visit_sent_at: string | null;
  calendar_id: string | null;
  guest: GuestInfo | null;
}

function normalizeBookings(rows: unknown[]): BookingRow[] {
  return rows.map((r) => {
    const row = r as Record<string, unknown>;
    const rawGuest = row.guest;
    let guest: GuestInfo | null = null;
    if (Array.isArray(rawGuest) && rawGuest.length > 0) {
      guest = rawGuest[0] as GuestInfo;
    } else if (rawGuest && typeof rawGuest === 'object' && !Array.isArray(rawGuest)) {
      guest = rawGuest as GuestInfo;
    }
    return { ...row, guest } as BookingRow;
  });
}

function buildBookingData(b: BookingRow): BookingEmailData {
  return {
    id: b.id,
    guest_name: b.guest?.name ?? 'Guest',
    guest_email: b.guest_email ?? b.guest?.email ?? null,
    booking_date: b.booking_date,
    booking_time: b.booking_time.slice(0, 5),
    party_size: b.party_size,
    special_requests: b.special_requests,
    dietary_notes: b.dietary_notes,
    deposit_amount_pence: b.deposit_amount_pence,
    deposit_status: b.deposit_status,
    refund_cutoff: b.cancellation_deadline,
  };
}

function buildVenueData(v: { name: string; address: string | null }): VenueEmailData {
  return { name: v.name, address: v.address };
}

function getGuestEmail(b: BookingRow): string | null {
  return b.guest_email ?? b.guest?.email ?? null;
}

function getGuestPhone(b: BookingRow): string | null {
  return b.guest?.phone ?? null;
}

function bookingStartUtcMs(b: BookingRow, tz: string): number {
  return venueLocalDateTimeToUtcMs(b.booking_date, b.booking_time.slice(0, 5), tz);
}

/** End instant: booking_end_time if set, else start + 60m fallback. */
function bookingEndUtcMs(b: BookingRow, tz: string): number {
  if (b.booking_end_time) {
    const t = String(b.booking_end_time).slice(0, 5);
    return venueLocalDateTimeToUtcMs(b.booking_date, t, tz);
  }
  return bookingStartUtcMs(b, tz) + 60 * 60 * 1000;
}

export interface UnifiedCommsResults {
  unified_reminder_1: number;
  unified_reminder_2: number;
  unified_post_visit: number;
  errors: number;
}

export async function runUnifiedSchedulingComms(
  supabase: SupabaseClient,
  results: UnifiedCommsResults,
): Promise<void> {
  const baseUrl = normalizePublicBaseUrl(process.env.NEXT_PUBLIC_BASE_URL);
  const nowMs = Date.now();

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address, timezone, booking_model')
    .in('booking_model', ['unified_scheduling', 'practitioner_appointment']);

  for (const venue of venues ?? []) {
    const tz = (venue as { timezone?: string }).timezone ?? 'Europe/London';
    const vid = (venue as { id: string }).id;
    const ns = await getVenueNotificationSettings(vid);
    const comm = await getCommSettings(vid);

    await sendUnifiedReminder1(
      supabase,
      venue as { id: string; name: string; address: string | null },
      tz,
      ns,
      comm,
      baseUrl,
      nowMs,
      results,
    );
    await sendUnifiedReminder2(
      supabase,
      venue as { id: string; name: string; address: string | null },
      tz,
      ns,
      comm,
      baseUrl,
      nowMs,
      results,
    );
    await sendUnifiedPostVisit(
      supabase,
      venue as { id: string; name: string; address: string | null },
      tz,
      ns,
      comm,
      baseUrl,
      nowMs,
      results,
    );
  }
}

async function sendUnifiedReminder1(
  supabase: SupabaseClient,
  venue: { id: string; name: string; address: string | null },
  tz: string,
  ns: Awaited<ReturnType<typeof getVenueNotificationSettings>>,
  comm: Awaited<ReturnType<typeof getCommSettings>>,
  baseUrl: string,
  nowMs: number,
  results: UnifiedCommsResults,
) {
  if (!ns.reminder_1_enabled) return;
  const hours = ns.reminder_1_hours_before;
  const targetMs = hours * 60 * 60 * 1000;

  const { data: bookings } = await supabase
    .from('bookings')
    .select(UNIFIED_BOOKING_SELECT)
    .eq('venue_id', venue.id)
    .is('reminder_sent_at', null)
    .in('status', ['Pending', 'Confirmed']);

  const venueData = buildVenueData(venue);
  const smsOk = await isSmsAllowed(venue.id);

  for (const b of normalizeBookings(bookings ?? [])) {
    try {
      const startMs = bookingStartUtcMs(b, tz);
      const delta = startMs - nowMs;
      if (delta < targetMs - TOLERANCE_MS || delta > targetMs + TOLERANCE_MS) continue;

      const hmac = createBookingHmac(b.id);
      const confirmCancelLink = `${baseUrl}/confirm/${b.id}?hmac=${encodeURIComponent(hmac)}`;
      const manageLink = `${baseUrl}/manage/${b.id}?hmac=${encodeURIComponent(hmac)}`;
      let bookingData = buildBookingData(b);
      bookingData.confirm_cancel_link = confirmCancelLink;
      bookingData.manage_booking_link = manageLink;
      bookingData = await enrichBookingEmailForAppointment(supabase, b.id, bookingData);

      const email = getGuestEmail(b);
      const phone = getGuestPhone(b);

      let sentAny = false;
      if (ns.reminder_1_channels.includes('email') && email) {
        const canSend = await logToCommLogs({
          venue_id: venue.id,
          booking_id: b.id,
          message_type: 'reminder_1_email',
          channel: 'email',
          recipient: email,
          status: 'pending',
        });
        if (canSend) {
          const rendered = renderReminder56h(bookingData, venueData, null);
          await sendEmail({ to: email, ...rendered });
          sentAny = true;
        }
      }

      if (ns.reminder_1_channels.includes('sms') && phone && smsOk) {
        const canSend = await logToCommLogs({
          venue_id: venue.id,
          booking_id: b.id,
          message_type: 'reminder_1_sms',
          channel: 'sms',
          recipient: phone,
          status: 'sent',
        });
        if (canSend) {
          const sms = renderDayOfReminderSms(bookingData, venueData, comm.day_of_reminder_custom_message);
          const { sid, segmentCount } = await sendSmsWithSegments(phone, sms.body);
          await recordOutboundSms({
            venueId: venue.id,
            bookingId: b.id,
            messageType: 'reminder_1_sms',
            recipientPhone: phone,
            twilioSid: sid ?? undefined,
            segmentCount,
          });
          sentAny = true;
        }
      }

      if (sentAny) {
        await supabase.from('bookings').update({ reminder_sent_at: new Date().toISOString() }).eq('id', b.id);
        results.unified_reminder_1++;
      }
    } catch (e) {
      console.error('[unified reminder_1]', b.id, e);
      results.errors++;
    }
  }
}

async function sendUnifiedReminder2(
  supabase: SupabaseClient,
  venue: { id: string; name: string; address: string | null },
  tz: string,
  ns: Awaited<ReturnType<typeof getVenueNotificationSettings>>,
  comm: Awaited<ReturnType<typeof getCommSettings>>,
  baseUrl: string,
  nowMs: number,
  results: UnifiedCommsResults,
) {
  if (!ns.reminder_2_enabled) return;
  if (!ns.reminder_2_channels.includes('sms')) return;
  const hours = ns.reminder_2_hours_before;
  const targetMs = hours * 60 * 60 * 1000;
  const smsOk = await isSmsAllowed(venue.id);
  if (!smsOk) return;

  const { data: bookings } = await supabase
    .from('bookings')
    .select(UNIFIED_BOOKING_SELECT)
    .eq('venue_id', venue.id)
    .not('reminder_sent_at', 'is', null)
    .is('final_reminder_sent_at', null)
    .eq('status', 'Confirmed');

  const venueData = buildVenueData(venue);

  for (const b of normalizeBookings(bookings ?? [])) {
    try {
      const startMs = bookingStartUtcMs(b, tz);
      const delta = startMs - nowMs;
      if (delta < targetMs - TOLERANCE_MS || delta > targetMs + TOLERANCE_MS) continue;

      const phone = getGuestPhone(b);
      if (!phone) continue;

      const hmac = createBookingHmac(b.id);
      const manageLink = `${baseUrl}/manage/${b.id}?hmac=${encodeURIComponent(hmac)}`;
      let bookingData = buildBookingData(b);
      bookingData.manage_booking_link = manageLink;
      bookingData = await enrichBookingEmailForAppointment(supabase, b.id, bookingData);

      const canSend = await logToCommLogs({
        venue_id: venue.id,
        booking_id: b.id,
        message_type: 'reminder_2_sms',
        channel: 'sms',
        recipient: phone,
        status: 'sent',
      });
      if (!canSend) continue;

      const sms = renderDayOfReminderSms(bookingData, venueData, null);
      const { sid, segmentCount } = await sendSmsWithSegments(phone, sms.body);
      await recordOutboundSms({
        venueId: venue.id,
        bookingId: b.id,
        messageType: 'reminder_2_sms',
        recipientPhone: phone,
        twilioSid: sid ?? undefined,
        segmentCount,
      });
      await supabase.from('bookings').update({ final_reminder_sent_at: new Date().toISOString() }).eq('id', b.id);
      results.unified_reminder_2++;
    } catch (e) {
      console.error('[unified reminder_2]', b.id, e);
      results.errors++;
    }
  }
}

async function sendUnifiedPostVisit(
  supabase: SupabaseClient,
  venue: { id: string; name: string; address: string | null },
  tz: string,
  ns: Awaited<ReturnType<typeof getVenueNotificationSettings>>,
  comm: Awaited<ReturnType<typeof getCommSettings>>,
  _baseUrl: string,
  nowMs: number,
  results: UnifiedCommsResults,
) {
  if (!ns.post_visit_enabled) return;

  const { data: bookings } = await supabase
    .from('bookings')
    .select(UNIFIED_BOOKING_SELECT)
    .eq('venue_id', venue.id)
    .is('post_visit_sent_at', null)
    .eq('status', 'Completed');

  const venueData = buildVenueData(venue);

  for (const b of normalizeBookings(bookings ?? [])) {
    try {
      const email = getGuestEmail(b);
      if (!email) continue;

      const endMs = bookingEndUtcMs(b, tz);
      const fourHoursAfter = endMs + 4 * 60 * 60 * 1000;

      const hourFmt = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      });
      const endParts = hourFmt.formatToParts(new Date(endMs));
      const endHour = Number(endParts.find((p) => p.type === 'hour')?.value ?? '12');
      const endMinute = Number(endParts.find((p) => p.type === 'minute')?.value ?? '0');
      const endMinutesOfDay = endHour * 60 + endMinute;

      let eligible = false;
      if (endMinutesOfDay <= 17 * 60) {
        eligible = nowMs >= fourHoursAfter;
      } else {
        const endYmd = formatYmdInTimezone(endMs, tz);
        const nextYmd = addDaysToYmd(endYmd, 1);
        const nineMs = venueLocalDateTimeToUtcMs(nextYmd, '09:00', tz);
        eligible = nowMs >= nineMs;
      }

      if (!eligible) continue;

      let bookingData = buildBookingData(b);
      bookingData = await enrichBookingEmailForAppointment(supabase, b.id, bookingData);
      const rendered = renderPostVisitEmail(bookingData, venueData, comm.post_visit_email_custom_message);

      const canSend = await logToCommLogs({
        venue_id: venue.id,
        booking_id: b.id,
        message_type: 'unified_post_visit_email',
        channel: 'email',
        recipient: email,
        status: 'sent',
      });
      if (!canSend) continue;

      await sendEmail({ to: email, ...rendered });
      await supabase.from('bookings').update({ post_visit_sent_at: new Date().toISOString() }).eq('id', b.id);
      results.unified_post_visit++;
    } catch (e) {
      console.error('[unified post_visit]', b.id, e);
      results.errors++;
    }
  }
}

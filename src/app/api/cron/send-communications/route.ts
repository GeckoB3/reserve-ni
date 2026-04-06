import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import {
  confirmCancelReminderSmsCustomLine,
  dayOfReminderSmsCustomLine,
  getCommSettings,
  logToCommLogs,
} from '@/lib/communications/service';
import { renderReminder56h } from '@/lib/emails/templates/reminder-56h';
import { renderDayOfReminderEmail } from '@/lib/emails/templates/day-of-reminder-email';
import { renderDayOfReminderSms } from '@/lib/emails/templates/day-of-reminder-sms';
import { renderPostVisitEmail } from '@/lib/emails/templates/post-visit';
import { sendEmail } from '@/lib/emails/send-email';
import { sendSmsWithSegments } from '@/lib/emails/send-sms';
import { recordOutboundSms } from '@/lib/sms-usage';
import { isSmsAllowed } from '@/lib/tier-enforcement';
import { createShortConfirmLink, createShortManageLink } from '@/lib/short-manage-link';
import { enrichBookingEmailForAppointment } from '@/lib/emails/booking-email-enrichment';
import type { BookingEmailData, VenueEmailData } from '@/lib/emails/types';
import { requireCronAuthorisation } from '@/lib/cron-auth';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { isCdeBookingRow } from '@/lib/booking/cde-booking';
import { getVenueNotificationSettings } from '@/lib/notifications/notification-settings';
import { runUnifiedSchedulingComms, runSecondaryModelScheduledComms } from '@/lib/cron/unified-scheduling-comms';

/**
 * Unified cron handler for scheduled guest communications (every ~15 minutes).
 *
 * **Legacy restaurant paths** (table_reservation, etc.): 56h reminder, day-of SMS/email, post-visit.
 * These loops **skip** `unified_scheduling` venues (`isUnifiedSchedulingVenue`) so they are not double-sent.
 *
 * **Unified scheduling** (`runUnifiedSchedulingComms`): reminder_1, reminder_2, post_visit for Model B
 * rows only (appointment-like bookings). See §4.2 map in `src/lib/cron/unified-scheduling-comms.ts`.
 *
 * **Models C/D/E** (`runSecondaryModelScheduledComms`): same notification_settings windows as unified,
 * but only bookings with event/class/resource FKs. Runs for **all** venues (including unified primary
 * with secondaries); inner loops filter to C/D/E rows - no double-send for Model B appointments.
 *
 * Confirmation, deposit, reschedule, cancellation, and no-show notifications use transactional / other
 * code paths (`send-templated`, webhooks, `CommunicationService`), not this cron.
 *
 * Uses `communication_logs` UNIQUE(booking_id, message_type) for dedup where applicable.
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuthorisation(request);
  if (denied) return denied;

  const results = {
    reminders_56h: 0,
    day_of_reminders: 0,
    post_visit: 0,
    unified_reminder_1: 0,
    unified_reminder_2: 0,
    unified_post_visit: 0,
    cde_reminder_1: 0,
    cde_reminder_2: 0,
    cde_post_visit: 0,
    errors: 0,
  };

  const supabase = getSupabaseAdminClient();

  try {
    const unifiedResults = {
      unified_reminder_1: 0,
      unified_reminder_2: 0,
      unified_post_visit: 0,
      errors: 0,
    };
    const secondaryResults = {
      cde_reminder_1: 0,
      cde_reminder_2: 0,
      cde_post_visit: 0,
      errors: 0,
    };
    const [r1, r2, r3, u1, cdeRun] = await Promise.allSettled([
      send56hReminders(results),
      sendDayOfReminders(results),
      sendPostVisitEmails(results),
      runUnifiedSchedulingComms(supabase, unifiedResults),
      runSecondaryModelScheduledComms(supabase, secondaryResults),
    ]);

    results.unified_reminder_1 = unifiedResults.unified_reminder_1;
    results.unified_reminder_2 = unifiedResults.unified_reminder_2;
    results.unified_post_visit = unifiedResults.unified_post_visit;
    results.errors += unifiedResults.errors;

    results.cde_reminder_1 = secondaryResults.cde_reminder_1;
    results.cde_reminder_2 = secondaryResults.cde_reminder_2;
    results.cde_post_visit = secondaryResults.cde_post_visit;
    results.errors += secondaryResults.errors;

    for (const r of [r1, r2, r3, u1, cdeRun]) {
      if (r.status === 'rejected') {
        console.error('[send-communications] sub-task failed:', r.reason);
        results.errors++;
      }
    }
  } catch (err) {
    console.error('[send-communications] top-level error:', err);
    results.errors++;
  }

  return NextResponse.json({ ok: true, ...results });
}

function toVenueLocal(date: Date, tz: string): Date {
  const localeStr = date.toLocaleString('en-GB', { timeZone: tz });
  const [datePart, timePart] = localeStr.split(', ');
  const [d, m, y] = datePart!.split('/').map(Number);
  const [h, min, s] = timePart!.split(':').map(Number);
  return new Date(y!, m! - 1, d!, h!, min!, s!);
}

function localTimeStr(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}

function localDateStr(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

interface GuestInfo { name: string | null; email: string | null; phone: string | null }

interface BookingRow {
  id: string;
  venue_id: string;
  guest_id: string;
  guest_email: string | null;
  booking_date: string;
  booking_time: string;
  party_size: number;
  special_requests: string | null;
  dietary_notes: string | null;
  deposit_amount_pence: number | null;
  deposit_status: string | null;
  cancellation_deadline: string | null;
  status: string;
  experience_event_id: string | null;
  class_instance_id: string | null;
  resource_id: string | null;
  guest: GuestInfo | null;
}

const BOOKING_SELECT =
  'id, venue_id, guest_id, guest_email, booking_date, booking_time, party_size, special_requests, dietary_notes, deposit_amount_pence, deposit_status, cancellation_deadline, status, experience_event_id, class_instance_id, resource_id, guest:guests(name, email, phone)';

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

function buildVenueData(v: { name: string; address: string | null; booking_page_url?: string }): VenueEmailData {
  return {
    name: v.name,
    address: v.address,
    booking_page_url: v.booking_page_url,
  };
}

function getGuestEmail(b: BookingRow): string | null {
  return b.guest_email ?? b.guest?.email ?? null;
}

function getGuestPhone(b: BookingRow): string | null {
  return b.guest?.phone ?? null;
}

// ─── CONFIRM-OR-CANCEL REMINDERS (configurable hours before) ──────────

async function send56hReminders(results: { reminders_56h: number; errors: number }) {
  const supabase = getSupabaseAdminClient();
  const now = new Date();

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address, timezone, booking_model');

  if (!venues?.length) return;

  for (const venue of venues) {
    try {
      if (isUnifiedSchedulingVenue((venue as { booking_model?: string }).booking_model)) continue;

      const tz = venue.timezone ?? 'Europe/London';
      const settings = await getCommSettings(venue.id);
      const ns = await getVenueNotificationSettings(venue.id);

      if (!settings.reminder_email_enabled || !ns.reminder_1_enabled) continue;

      const reminderHours = settings.reminder_hours_before ?? 56;
      const nowLocal = toVenueLocal(now, tz);
      const nowLocalMs = nowLocal.getTime();

      const tolerance = 15 * 60 * 1000;
      const windowStart = new Date(nowLocalMs + reminderHours * 60 * 60 * 1000 - tolerance);
      const windowEnd = new Date(nowLocalMs + reminderHours * 60 * 60 * 1000 + tolerance);

      const startDate = localDateStr(windowStart);
      const endDate = localDateStr(windowEnd);
      const dates = [startDate];
      if (endDate !== startDate) dates.push(endDate);

      const { data: bookings } = await supabase
        .from('bookings')
        .select(BOOKING_SELECT)
        .eq('venue_id', venue.id)
        .in('booking_date', dates)
        .in('status', ['Pending', 'Confirmed']);

      if (!bookings?.length) continue;

      const normalized = normalizeBookings(bookings);
      const venueData = buildVenueData(venue);
      const smsOk = await isSmsAllowed(venue.id);

      for (const b of normalized) {
        try {
          if (isCdeBookingRow(b)) continue;

          const bookingDateTime = new Date(`${b.booking_date}T${b.booking_time}`);
          const bookingLocalMs = bookingDateTime.getTime();
          const diffMs = bookingLocalMs - nowLocalMs;
          const targetMs = reminderHours * 60 * 60 * 1000;

          if (diffMs < targetMs - tolerance || diffMs > targetMs + tolerance) continue;

          const confirmCancelLink = createShortConfirmLink(b.id);
          const manageLink = createShortManageLink(b.id);
          const bookingData = buildBookingData(b);
          bookingData.confirm_cancel_link = confirmCancelLink;
          bookingData.manage_booking_link = manageLink;

          const email = getGuestEmail(b);
          const phone = getGuestPhone(b);

          if (ns.reminder_1_channels.includes('email') && email) {
            const canSend = await logToCommLogs({
              venue_id: b.venue_id,
              booking_id: b.id,
              message_type: 'reminder_56h_email',
              channel: 'email',
              recipient: email,
              status: 'pending',
            });
            if (canSend) {
              const rendered = renderReminder56h(bookingData, venueData, settings.reminder_email_custom_message);
              await sendEmail({ to: email, ...rendered });
              results.reminders_56h++;
            }
          }

          if (ns.reminder_1_channels.includes('sms') && phone && smsOk) {
            const canSend = await logToCommLogs({
              venue_id: b.venue_id,
              booking_id: b.id,
              message_type: 'reminder_1_sms',
              channel: 'sms',
              recipient: phone,
              status: 'pending',
            });
            if (canSend) {
              const sms = renderDayOfReminderSms(
                bookingData,
                venueData,
                confirmCancelReminderSmsCustomLine(settings),
              );
              const { sid, segmentCount } = await sendSmsWithSegments(phone, sms.body);
              if (sid) {
                await recordOutboundSms({
                  venueId: b.venue_id,
                  bookingId: b.id,
                  messageType: 'reminder_1_sms',
                  recipientPhone: phone,
                  twilioSid: sid,
                  segmentCount,
                });
              }
              results.reminders_56h++;
            }
          }
        } catch (err) {
          console.error(`[confirm-cancel-reminder] booking ${b.id}:`, err);
          results.errors++;
        }
      }
    } catch (err) {
      console.error(`[confirm-cancel-reminder] venue ${venue.id}:`, err);
      results.errors++;
    }
  }
}

// ─── DAY-OF REMINDERS ─────────────────────────────────────────────────

async function sendDayOfReminders(results: { day_of_reminders: number; errors: number }) {
  const supabase = getSupabaseAdminClient();
  const now = new Date();

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address, timezone, booking_model');

  if (!venues?.length) return;

  for (const venue of venues) {
    try {
      if (isUnifiedSchedulingVenue((venue as { booking_model?: string }).booking_model)) continue;

      const tz = venue.timezone ?? 'Europe/London';
      const nowLocal = toVenueLocal(now, tz);
      const nowTimeStr = localTimeStr(nowLocal);
      const todayStr = localDateStr(nowLocal);

      const settings = await getCommSettings(venue.id);
      if (!settings.day_of_reminder_enabled) continue;
      if (!settings.day_of_reminder_sms_enabled && !settings.day_of_reminder_email_enabled) continue;

      const dayOfSmsTierOk = await isSmsAllowed(venue.id);

      const sendTime = settings.day_of_reminder_time;
      const [sh, sm] = sendTime.split(':').map(Number);
      const sendMins = (sh ?? 9) * 60 + (sm ?? 0);
      const [nh, nm] = nowTimeStr.split(':').map(Number);
      const nowMins = (nh ?? 0) * 60 + (nm ?? 0);
      if (nowMins < sendMins || nowMins >= sendMins + 15) continue;

      const { data: bookings } = await supabase
        .from('bookings')
        .select(BOOKING_SELECT)
        .eq('venue_id', venue.id)
        .eq('booking_date', todayStr)
        .in('status', ['Pending', 'Confirmed']);

      if (!bookings?.length) continue;

      const venueData = buildVenueData(venue);

      for (const b of normalizeBookings(bookings)) {
        try {
          if (isCdeBookingRow(b)) continue;

          const manageLinkDay = createShortManageLink(b.id);
          const confirmLinkDay = createShortConfirmLink(b.id);
          let bookingData = buildBookingData(b);
          bookingData.manage_booking_link = manageLinkDay;
          bookingData.confirm_cancel_link = confirmLinkDay;
          bookingData = await enrichBookingEmailForAppointment(supabase, b.id, bookingData);

          const phone = getGuestPhone(b);
          const email = getGuestEmail(b);

          // SMS reminder (Business / Founding only)
          if (settings.day_of_reminder_sms_enabled && phone && dayOfSmsTierOk) {
            const sms = renderDayOfReminderSms(bookingData, venueData, dayOfReminderSmsCustomLine(settings));
            const canSend = await logToCommLogs({
              venue_id: venue.id,
              booking_id: b.id,
              message_type: 'day_of_reminder_sms',
              channel: 'sms',
              recipient: phone,
              status: 'sent',
            });
            if (canSend) {
              const { sid, segmentCount } = await sendSmsWithSegments(phone, sms.body);
              if (sid) {
                await recordOutboundSms({
                  venueId: venue.id,
                  bookingId: b.id,
                  messageType: 'day_of_reminder_sms',
                  recipientPhone: phone,
                  twilioSid: sid,
                  segmentCount,
                });
              }
              results.day_of_reminders++;
            }
          }

          // Email reminder
          if (settings.day_of_reminder_email_enabled && email) {
            const emailContent = renderDayOfReminderEmail(bookingData, venueData, settings.day_of_reminder_custom_message);
            const canSend = await logToCommLogs({
              venue_id: venue.id,
              booking_id: b.id,
              message_type: 'day_of_reminder_email',
              channel: 'email',
              recipient: email,
              status: 'sent',
            });
            if (canSend) {
              await sendEmail({ to: email, ...emailContent });
              results.day_of_reminders++;
            }
          }
        } catch (err) {
          console.error(`[day-of-reminder] booking ${b.id}:`, err);
          results.errors++;
        }
      }
    } catch (err) {
      console.error(`[day-of-reminder] venue ${venue.id}:`, err);
      results.errors++;
    }
  }
}

// ─── POST-VISIT THANK YOU ─────────────────────────────────────────────

async function sendPostVisitEmails(results: { post_visit: number; errors: number }) {
  const supabase = getSupabaseAdminClient();
  const now = new Date();

  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address, timezone, booking_model');

  if (!venues?.length) return;

  for (const venue of venues) {
    try {
      if (isUnifiedSchedulingVenue((venue as { booking_model?: string }).booking_model)) continue;

      const tz = venue.timezone ?? 'Europe/London';
      const nowLocal = toVenueLocal(now, tz);
      const nowTimeStr = localTimeStr(nowLocal);

      const settings = await getCommSettings(venue.id);
      if (!settings.post_visit_email_enabled) continue;

      const sendTime = settings.post_visit_email_time;
      const [sh, sm] = sendTime.split(':').map(Number);
      const sendMins = (sh ?? 9) * 60 + (sm ?? 0);
      const [nh, nm] = nowTimeStr.split(':').map(Number);
      const nowMins = (nh ?? 0) * 60 + (nm ?? 0);
      if (nowMins < sendMins || nowMins >= sendMins + 15) continue;

      const yesterday = new Date(nowLocal);
      yesterday.setDate(yesterday.getDate() - 1);
      const yesterdayStr = localDateStr(yesterday);

      const { data: bookings } = await supabase
        .from('bookings')
        .select(BOOKING_SELECT)
        .eq('venue_id', venue.id)
        .eq('booking_date', yesterdayStr)
        .eq('status', 'Completed');

      if (!bookings?.length) continue;

      const venueData = buildVenueData(venue);

      for (const b of normalizeBookings(bookings)) {
        try {
          if (isCdeBookingRow(b)) continue;

          const email = getGuestEmail(b);
          if (!email) continue;

          let bookingData = buildBookingData(b);
          bookingData = await enrichBookingEmailForAppointment(supabase, b.id, bookingData);
          const rendered = renderPostVisitEmail(bookingData, venueData, settings.post_visit_email_custom_message);

          const canSend = await logToCommLogs({
            venue_id: venue.id,
            booking_id: b.id,
            message_type: 'post_visit_email',
            channel: 'email',
            recipient: email,
            status: 'sent',
          });
          if (!canSend) continue;

          await sendEmail({ to: email, ...rendered });
          results.post_visit++;
        } catch (err) {
          console.error(`[post-visit] booking ${b.id}:`, err);
          results.errors++;
        }
      }
    } catch (err) {
      console.error(`[post-visit] venue ${venue.id}:`, err);
      results.errors++;
    }
  }
}

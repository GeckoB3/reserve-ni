import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getCommSettings, logToCommLogs } from '@/lib/communications/service';
import { renderReminder56h } from '@/lib/emails/templates/reminder-56h';
import { renderDayOfReminderEmail } from '@/lib/emails/templates/day-of-reminder-email';
import { renderDayOfReminderSms } from '@/lib/emails/templates/day-of-reminder-sms';
import { renderPostVisitEmail } from '@/lib/emails/templates/post-visit';
import { sendEmail } from '@/lib/emails/send-email';
import { sendSms } from '@/lib/emails/send-sms';
import type { BookingEmailData, VenueEmailData } from '@/lib/emails/types';

/**
 * Unified cron handler for scheduled guest communications.
 * Runs every 15 minutes. Handles:
 * 1. 56-hour reminder emails
 * 2. Day-of reminders (SMS + email)
 * 3. Post-visit thank-you emails
 *
 * Uses communication_logs UNIQUE(booking_id, message_type) for dedup.
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results = { reminders_56h: 0, day_of_reminders: 0, post_visit: 0, errors: 0 };

  try {
    const [r1, r2, r3] = await Promise.allSettled([
      send56hReminders(results),
      sendDayOfReminders(results),
      sendPostVisitEmails(results),
    ]);

    for (const r of [r1, r2, r3]) {
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
  guest: { name: string | null; email: string | null; phone: string | null } | null;
}

const BOOKING_SELECT = 'id, venue_id, guest_id, guest_email, booking_date, booking_time, party_size, special_requests, dietary_notes, deposit_amount_pence, deposit_status, cancellation_deadline, status, guest:guests(name, email, phone)';

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

// ─── 56-HOUR REMINDERS ────────────────────────────────────────────────

async function send56hReminders(results: { reminders_56h: number; errors: number }) {
  const supabase = getSupabaseAdminClient();
  const now = new Date();

  // Window: 55h45m to 56h15m
  const windowStart = new Date(now.getTime() + 55 * 60 * 60 * 1000 + 45 * 60 * 1000);
  const windowEnd = new Date(now.getTime() + 56 * 60 * 60 * 1000 + 15 * 60 * 1000);

  const startDate = localDateStr(windowStart);
  const endDate = localDateStr(windowEnd);

  const dates = [startDate];
  if (endDate !== startDate) dates.push(endDate);

  const { data: bookings } = await supabase
    .from('bookings')
    .select(BOOKING_SELECT)
    .in('booking_date', dates)
    .in('status', ['Pending', 'Confirmed']);

  if (!bookings?.length) return;

  // Filter to bookings with email
  const emailBookings = (bookings as BookingRow[]).filter((b) => getGuestEmail(b));

  if (!emailBookings.length) return;

  const venueIds = [...new Set(emailBookings.map((b) => b.venue_id))];
  const { data: venues } = await supabase
    .from('venues')
    .select('id, name, address, timezone')
    .in('id', venueIds);
  const venueMap = new Map((venues ?? []).map((v) => [v.id, v]));

  for (const b of emailBookings) {
    try {
      const venue = venueMap.get(b.venue_id);
      if (!venue) continue;

      const tz = venue.timezone ?? 'Europe/London';
      const bookingDateTime = new Date(`${b.booking_date}T${b.booking_time}`);
      const bookingLocalMs = bookingDateTime.getTime();
      const nowLocal = toVenueLocal(now, tz);
      const nowLocalMs = nowLocal.getTime();
      const diffMs = bookingLocalMs - nowLocalMs;
      const h56 = 56 * 60 * 60 * 1000;
      const tolerance = 15 * 60 * 1000;

      if (diffMs < h56 - tolerance || diffMs > h56 + tolerance) continue;

      const settings = await getCommSettings(b.venue_id);
      if (!settings.reminder_email_enabled) continue;

      const email = getGuestEmail(b)!;
      const bookingData = buildBookingData(b);
      const venueData = buildVenueData(venue);
      const rendered = renderReminder56h(bookingData, venueData, settings.reminder_email_custom_message);

      const canSend = await logToCommLogs({
        venue_id: b.venue_id,
        booking_id: b.id,
        message_type: 'reminder_56h_email',
        channel: 'email',
        recipient: email,
        status: 'sent',
      });
      if (!canSend) continue;

      await sendEmail({ to: email, ...rendered });
      results.reminders_56h++;
    } catch (err) {
      console.error(`[56h-reminder] booking ${b.id}:`, err);
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
    .select('id, name, address, timezone');

  if (!venues?.length) return;

  for (const venue of venues) {
    try {
      const tz = venue.timezone ?? 'Europe/London';
      const nowLocal = toVenueLocal(now, tz);
      const nowTimeStr = localTimeStr(nowLocal);
      const todayStr = localDateStr(nowLocal);

      const settings = await getCommSettings(venue.id);
      if (!settings.day_of_reminder_enabled) continue;
      if (!settings.day_of_reminder_sms_enabled && !settings.day_of_reminder_email_enabled) continue;

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

      for (const b of bookings as BookingRow[]) {
        try {
          const bookingData = buildBookingData(b);
          const phone = getGuestPhone(b);
          const email = getGuestEmail(b);

          // SMS reminder
          if (settings.day_of_reminder_sms_enabled && phone) {
            const sms = renderDayOfReminderSms(bookingData, venueData, settings.day_of_reminder_custom_message);
            const canSend = await logToCommLogs({
              venue_id: venue.id,
              booking_id: b.id,
              message_type: 'day_of_reminder_sms',
              channel: 'sms',
              recipient: phone,
              status: 'sent',
            });
            if (canSend) {
              await sendSms(phone, sms.body);
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
    .select('id, name, address, timezone');

  if (!venues?.length) return;

  for (const venue of venues) {
    try {
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

      for (const b of bookings as BookingRow[]) {
        try {
          const email = getGuestEmail(b);
          if (!email) continue;

          const bookingData = buildBookingData(b);
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

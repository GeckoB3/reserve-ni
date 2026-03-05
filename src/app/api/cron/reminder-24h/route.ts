import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';

/**
 * POST /api/cron/reminder-24h
 * Run every 15 minutes. Finds bookings with reservation time 23.5–24.5 hours from now,
 * reminder_sent_at is null, status Confirmed. Generates confirm token, sends SMS with
 * confirm-or-cancel link, sets reminder_sent_at.
 * Secure with CRON_SECRET.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date();

    const windowStart = new Date(now.getTime() + 23.5 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 24.5 * 60 * 60 * 1000);

    const dateStart = windowStart.toISOString().slice(0, 10);
    const dateEnd = windowEnd.toISOString().slice(0, 10);

    const { data: bookings, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, booking_date, booking_time, reminder_sent_at, status')
      .is('reminder_sent_at', null)
      .in('status', ['Confirmed', 'Pending'])
      .gte('booking_date', dateStart)
      .lte('booking_date', dateEnd);

    if (fetchErr) {
      console.error('reminder-24h fetch failed:', fetchErr);
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }

    const origin = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
    let sent = 0;

    for (const b of bookings ?? []) {
      const [y, m, d] = (b.booking_date as string).split('-').map(Number);
      const timeStr = typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '00:00';
      const [hh, mm] = timeStr.split(':').map(Number);
      const bookingDt = new Date(y!, m! - 1, d!, hh, mm, 0);
      if (bookingDt < windowStart || bookingDt > windowEnd) continue;

      const token = generateConfirmToken();
      const tokenHash = hashConfirmToken(token);

      const { error: updateErr } = await supabase
        .from('bookings')
        .update({
          confirm_token_hash: tokenHash,
          reminder_sent_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .eq('id', b.id);

      if (updateErr) {
        console.error('reminder-24h update booking failed:', b.id, updateErr);
        continue;
      }

      const confirmLink = `${origin}/confirm/${b.id}/${token}`;

      const { data: venue } = await supabase.from('venues').select('name').eq('id', b.venue_id).single();
      const { data: guest } = await supabase.from('guests').select('name, phone').eq('id', b.guest_id).single();

      if (!guest?.phone) continue;

      await sendCommunication({
        type: 'confirm_or_cancel_prompt',
        recipient: { phone: guest.phone },
        payload: {
          venue_name: venue?.name ?? 'Venue',
          booking_date: b.booking_date,
          booking_time: timeStr,
          confirm_link: confirmLink,
          cancel_link: confirmLink,
        },
      });

      sent++;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error('reminder-24h failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

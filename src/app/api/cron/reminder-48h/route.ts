import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';

/**
 * POST /api/cron/reminder-48h
 * Sends pre-visit reminder email 48 hours before reservation.
 * Window: 47.5–48.5 hours from now. Run every 15 minutes.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() + 47.5 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() + 48.5 * 60 * 60 * 1000);
    const dateStart = windowStart.toISOString().slice(0, 10);
    const dateEnd = windowEnd.toISOString().slice(0, 10);

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, booking_date, booking_time, party_size, status, confirm_token_hash, deposit_amount_pence, dietary_notes')
      .in('status', ['Confirmed', 'Pending'])
      .gte('booking_date', dateStart)
      .lte('booking_date', dateEnd);

    const origin = request.nextUrl.origin;
    let sent = 0;

    for (const b of bookings ?? []) {
      const [y, m, d] = (b.booking_date as string).split('-').map(Number);
      const timeStr = typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '00:00';
      const [hh, mm] = timeStr.split(':').map(Number);
      const bookingDt = new Date(y!, m! - 1, d!, hh, mm, 0);
      if (bookingDt < windowStart || bookingDt > windowEnd) continue;

      const { data: venue } = await supabase.from('venues').select('name, address').eq('id', b.venue_id).single();
      const { data: guest } = await supabase.from('guests').select('name, email, phone').eq('id', b.guest_id).single();
      if (!guest?.email && !guest?.phone) continue;

      let manageLink: string | undefined;
      if (b.confirm_token_hash) {
        manageLink = `${origin}/manage/${b.id}/${encodeURIComponent(b.confirm_token_hash)}`;
      } else {
        const token = generateConfirmToken();
        await supabase.from('bookings').update({ confirm_token_hash: hashConfirmToken(token), updated_at: now.toISOString() }).eq('id', b.id);
        manageLink = `${origin}/manage/${b.id}/${encodeURIComponent(token)}`;
      }

      await sendCommunication({
        type: 'pre_visit_reminder',
        recipient: { email: guest.email ?? undefined, phone: guest.phone ?? undefined },
        payload: {
          guest_name: guest.name ?? 'Guest',
          venue_name: venue?.name ?? 'Venue',
          venue_address: venue?.address ?? undefined,
          booking_date: b.booking_date,
          booking_time: timeStr,
          party_size: b.party_size ?? 2,
          dietary_notes: b.dietary_notes ?? undefined,
          manage_booking_link: manageLink,
          deposit_amount: b.deposit_amount_pence ? (b.deposit_amount_pence / 100).toFixed(2) : undefined,
        },
      });
      sent++;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error('reminder-48h failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

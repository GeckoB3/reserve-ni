import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';

/**
 * POST /api/cron/post-visit-thankyou
 * Sends thank-you email ~3 hours after the reservation time for completed/seated bookings.
 * Window: bookings that ended 2.5–3.5 hours ago. Run every 15 minutes.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date();
    const windowStart = new Date(now.getTime() - 3.5 * 60 * 60 * 1000);
    const windowEnd = new Date(now.getTime() - 2.5 * 60 * 60 * 1000);
    const dateStart = windowStart.toISOString().slice(0, 10);
    const dateEnd = windowEnd.toISOString().slice(0, 10);

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, booking_date, booking_time, party_size')
      .in('status', ['Seated', 'Completed'])
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

      const { data: venue } = await supabase.from('venues').select('name, slug').eq('id', b.venue_id).single();
      const { data: guest } = await supabase.from('guests').select('name, email').eq('id', b.guest_id).single();
      if (!guest?.email) continue;

      const bookingPageLink = `${origin}/book/${venue?.slug ?? 'venue'}`;

      await sendCommunication({
        type: 'post_visit_thankyou',
        recipient: { email: guest.email },
        payload: {
          guest_name: guest.name ?? 'Guest',
          venue_name: venue?.name ?? 'Venue',
          booking_page_link: bookingPageLink,
        },
      });
      sent++;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error('post-visit-thankyou failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

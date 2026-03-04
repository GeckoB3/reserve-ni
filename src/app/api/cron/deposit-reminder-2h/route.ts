import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';

/**
 * POST /api/cron/deposit-reminder-2h
 * Sends a follow-up SMS if a phone booking deposit hasn't been paid 2 hours after creation.
 * Run every 15 minutes.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const now = new Date();
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const twoAndHalfHoursAgo = new Date(now.getTime() - 2.5 * 60 * 60 * 1000);

    const { data: bookings } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, booking_date, booking_time, party_size, deposit_amount_pence, stripe_payment_intent_id, created_at')
      .eq('source', 'phone')
      .eq('status', 'Pending')
      .eq('deposit_status', 'Pending')
      .gte('created_at', twoAndHalfHoursAgo.toISOString())
      .lte('created_at', twoHoursAgo.toISOString());

    const origin = request.nextUrl.origin;
    let sent = 0;

    for (const b of bookings ?? []) {
      const { data: venue } = await supabase.from('venues').select('name').eq('id', b.venue_id).single();
      const { data: guest } = await supabase.from('guests').select('name, phone').eq('id', b.guest_id).single();
      if (!guest?.phone) continue;

      const timeStr = typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '00:00';
      const depositAmount = b.deposit_amount_pence ? (b.deposit_amount_pence / 100).toFixed(2) : '5.00';
      const paymentLink = `${origin}/pay?booking_id=${b.id}`;

      await sendCommunication({
        type: 'deposit_payment_reminder',
        recipient: { phone: guest.phone },
        payload: {
          guest_name: guest.name ?? 'Guest',
          venue_name: venue?.name ?? 'Venue',
          booking_date: b.booking_date,
          booking_time: timeStr,
          party_size: b.party_size,
          deposit_amount: depositAmount,
          payment_link: paymentLink,
        },
      });
      sent++;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error('deposit-reminder-2h failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

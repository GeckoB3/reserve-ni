import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';

/**
 * POST /api/cron/auto-cancel-bookings
 * Call from a cron job (e.g. every 15 min). Cancels phone bookings that are still
 * Pending with deposit Pending and created more than 24 hours ago.
 * Secure with CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: bookings, error: fetchErr } = await supabase
      .from('bookings')
      .select('id, venue_id, guest_id, booking_date, booking_time, party_size, created_at')
      .eq('status', 'Pending')
      .eq('deposit_status', 'Pending')
      .eq('source', 'phone')
      .lt('created_at', cutoff);

    if (fetchErr) {
      console.error('auto-cancel fetch failed:', fetchErr);
      return NextResponse.json({ error: 'Fetch failed' }, { status: 500 });
    }

    const ids = (bookings ?? []).map((b) => b.id);
    if (ids.length === 0) {
      return NextResponse.json({ cancelled: 0 });
    }

    const { error: updateErr } = await supabase
      .from('bookings')
      .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
      .in('id', ids);

    if (updateErr) {
      console.error('auto-cancel update failed:', updateErr);
      return NextResponse.json({ error: 'Update failed' }, { status: 500 });
    }

    const eventRows = (bookings ?? []).map((b) => ({
      venue_id: b.venue_id,
      booking_id: b.id,
      event_type: 'auto_cancelled',
      payload: {
        reason: 'deposit_unpaid_timeout',
        source: 'auto-cancel-bookings-cron',
        cutoff,
      },
    }));
    if (eventRows.length > 0) {
      const { error: eventErr } = await supabase.from('events').insert(eventRows);
      if (eventErr) {
        console.error('auto-cancel events insert failed:', eventErr);
      }
    }

    for (const b of bookings ?? []) {
      const { data: guest } = await supabase.from('guests').select('name, email, phone').eq('id', b.guest_id).single();
      const { data: venue } = await supabase.from('venues').select('name').eq('id', b.venue_id).single();
      await sendCommunication({
        type: 'auto_cancel_notification',
        recipient: { email: guest?.email ?? undefined, phone: guest?.phone ?? undefined },
        payload: {
          guest_name: guest?.name,
          venue_name: venue?.name,
          booking_date: b.booking_date,
          booking_time: b.booking_time,
          party_size: b.party_size,
        },
      });
    }

    return NextResponse.json({ cancelled: ids.length });
  } catch (err) {
    console.error('auto-cancel failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

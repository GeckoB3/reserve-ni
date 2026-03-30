import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';
import { applyBookingLifecycleStatusEffects, validateBookingStatusTransition } from '@/lib/table-management/lifecycle';
import { requireCronAuthorisation } from '@/lib/cron-auth';

/**
 * GET/POST /api/cron/auto-cancel-bookings
 * Vercel Cron uses GET; POST kept for manual triggers.
 * Cancels phone bookings still Pending with deposit Pending after 24h.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const denied = requireCronAuthorisation(request);
  if (denied) return denied;

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

    for (const booking of bookings ?? []) {
      const check = validateBookingStatusTransition('Pending', 'Cancelled');
      if (!check.ok) continue;
      const { error: updateErr } = await supabase
        .from('bookings')
        .update({ status: 'Cancelled', updated_at: new Date().toISOString() })
        .eq('id', booking.id);
      if (updateErr) {
        console.error('auto-cancel update failed:', updateErr);
        return NextResponse.json({ error: 'Update failed' }, { status: 500 });
      }
      await applyBookingLifecycleStatusEffects(supabase, {
        bookingId: booking.id,
        guestId: booking.guest_id,
        previousStatus: 'Pending',
        nextStatus: 'Cancelled',
        actorId: null,
      });
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
        venue_id: b.venue_id,
        booking_id: b.id,
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

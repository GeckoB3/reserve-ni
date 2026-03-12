import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { sendCommunication } from '@/lib/communications';
import { createHmac } from 'crypto';

const schema = z.object({
  action: z.enum(['send_payment_link', 'waive', 'record_cash', 'refund']),
  amount_pence: z.number().int().min(0).max(500000).optional(),
});

function createPaymentToken(bookingId: string): string {
  const secret = process.env.PAYMENT_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY || 'dev-secret';
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${bookingId}:${exp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  const admin = getSupabaseAdminClient();
  const { data: booking } = await admin
    .from('bookings')
    .select('*')
    .eq('id', id)
    .eq('venue_id', staff.venue_id)
    .single();
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  if (parsed.data.action === 'waive') {
    await admin.from('bookings').update({ deposit_status: 'Waived', updated_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ success: true });
  }

  if (parsed.data.action === 'record_cash') {
    const amountPence = parsed.data.amount_pence ?? booking.deposit_amount_pence ?? 0;
    await admin.from('bookings').update({
      deposit_status: 'Paid',
      deposit_amount_pence: amountPence,
      updated_at: new Date().toISOString(),
    }).eq('id', id);
    return NextResponse.json({ success: true });
  }

  if (parsed.data.action === 'refund') {
    if (!booking.stripe_payment_intent_id) {
      return NextResponse.json({ error: 'No Stripe payment intent found' }, { status: 400 });
    }
    const { data: venue } = await admin
      .from('venues')
      .select('stripe_connected_account_id')
      .eq('id', staff.venue_id)
      .single();
    if (!venue?.stripe_connected_account_id) {
      return NextResponse.json({ error: 'Venue payment account not connected' }, { status: 400 });
    }
    await stripe.refunds.create(
      { payment_intent: booking.stripe_payment_intent_id },
      { stripeAccount: venue.stripe_connected_account_id }
    );
    await admin.from('bookings').update({ deposit_status: 'Refunded', updated_at: new Date().toISOString() }).eq('id', id);
    return NextResponse.json({ success: true });
  }

  const { data: existing } = await admin
    .from('communications')
    .select('id')
    .eq('booking_id', id)
    .eq('message_type', 'deposit_payment_request')
    .limit(1)
    .maybeSingle();
  if (existing) return NextResponse.json({ success: true, deduped: true });

  const { data: guest } = await admin.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
  const { data: venue } = await admin.from('venues').select('name').eq('id', staff.venue_id).single();
  if (!guest || !venue?.name) return NextResponse.json({ error: 'Guest or venue not found' }, { status: 400 });

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || request.nextUrl.origin;
  const paymentToken = createPaymentToken(id);
  const paymentLink = `${baseUrl}/pay?t=${paymentToken}`;
  await sendCommunication({
    type: 'deposit_payment_request',
    recipient: { email: guest.email ?? undefined, phone: guest.phone ?? undefined },
    payload: {
      guest_name: guest.name ?? 'Guest',
      payment_link: paymentLink,
      venue_name: venue.name,
      booking_date: booking.booking_date,
      booking_time: typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '',
      party_size: booking.party_size,
      deposit_amount: booking.deposit_amount_pence ? (booking.deposit_amount_pence / 100).toFixed(2) : undefined,
    },
  });
  return NextResponse.json({ success: true });
}

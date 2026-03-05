import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { findOrCreateGuest } from '@/lib/guests';
import { sendCommunication } from '@/lib/communications';
import { z } from 'zod';
import { createHmac } from 'crypto';

const phoneBookingSchema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  party_size: z.number().int().min(1).max(50),
  name: z.string().min(1).max(200),
  phone: z.string().min(1).max(30),
  email: z.string().email().optional().or(z.literal('')),
  require_deposit: z.boolean().optional(),
});

function cancellationDeadline(bookingDate: string, bookingTime: string): string {
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - 48);
  return dt.toISOString();
}

/** Create a signed payment URL token (booking_id + 24h expiry). */
function createPaymentToken(bookingId: string): string {
  const secret = process.env.PAYMENT_TOKEN_SECRET || process.env.STRIPE_SECRET_KEY || 'dev-secret';
  const exp = Date.now() + 24 * 60 * 60 * 1000;
  const payload = `${bookingId}:${exp}`;
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return Buffer.from(payload).toString('base64url') + '.' + sig;
}

/**
 * POST /api/venue/bookings — create a phone booking (staff). Status Pending, deposit Pending.
 * Returns payment_url if deposit required (stub: log SMS send).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = phoneBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { booking_date, booking_time, party_size, name, phone, email, require_deposit } = parsed.data;
    const venueId = staff.venue_id;
    const admin = getSupabaseAdminClient();

    const { data: venue } = await admin
      .from('venues')
      .select('id, name, stripe_connected_account_id, booking_rules, deposit_config')
      .eq('id', venueId)
      .single();

    if (!venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const depositConfig = (venue.deposit_config as { enabled?: boolean; amount_per_person_gbp?: number; phone_requires_deposit?: boolean }) ?? {};
    // Staff can override via the require_deposit toggle. If not provided, fall back to venue config.
    const requiresDeposit = require_deposit ?? (depositConfig.enabled && depositConfig.phone_requires_deposit);
    const amountPerPersonGbp = depositConfig.amount_per_person_gbp ?? 5;
    const depositAmountPence = requiresDeposit ? Math.round(amountPerPersonGbp * party_size * 100) : null;

    const { guest } = await findOrCreateGuest(admin, venueId, { name, email: email || null, phone });
    const timeForDb = booking_time.length === 5 ? booking_time + ':00' : booking_time;

    const bookingInsert = {
      venue_id: venueId,
      guest_id: guest.id,
      booking_date,
      booking_time: timeForDb,
      party_size,
      status: requiresDeposit ? 'Pending' : 'Confirmed',
      source: 'phone',
      deposit_amount_pence: depositAmountPence,
      deposit_status: requiresDeposit ? ('Pending' as const) : ('Not Required' as const),
      cancellation_deadline: cancellationDeadline(booking_date, booking_time),
    };

    const { data: booking, error: bookErr } = await admin
      .from('bookings')
      .insert(bookingInsert)
      .select('id')
      .single();

    if (bookErr) {
      console.error('Phone booking insert failed:', bookErr);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    let payment_url: string | undefined;

    if (requiresDeposit && depositAmountPence != null && depositAmountPence > 0 && venue.stripe_connected_account_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: depositAmountPence,
            currency: 'gbp',
            metadata: { booking_id: booking.id, venue_id: venueId },
            automatic_payment_methods: { enabled: true },
          },
          { stripeAccount: venue.stripe_connected_account_id }
        );

        await admin
          .from('bookings')
          .update({
            stripe_payment_intent_id: paymentIntent.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.id);

        const token = createPaymentToken(booking.id);
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
        payment_url = `${baseUrl}/pay?t=${token}`;
      } catch (stripeErr) {
        console.error('PaymentIntent create failed for phone booking:', stripeErr);
        await admin.from('bookings').delete().eq('id', booking.id);
        return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
      }

      try {
        await sendCommunication({
          type: 'deposit_payment_request',
          recipient: { email: guest.email ?? undefined, phone: guest.phone ?? undefined },
          payload: {
            guest_name: name,
            payment_link: payment_url,
            venue_name: venue.name,
            booking_date,
            booking_time,
            party_size,
            deposit_amount: depositAmountPence != null ? (depositAmountPence / 100).toFixed(2) : undefined,
          },
        });
      } catch (commsErr) {
        console.error('Deposit payment request comms failed (booking still created):', commsErr);
      }
    }

    return NextResponse.json(
      {
        booking_id: booking.id,
        payment_url: payment_url ?? undefined,
        message: payment_url ? 'Booking created. Deposit link sent to guest (stub: check logs).' : 'Booking created.',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/venue/bookings failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { findOrCreateGuest } from '@/lib/guests';
import { sendCommunication } from '@/lib/communications';
import { z } from 'zod';

const createBookingSchema = z.object({
  venue_id: z.string().uuid(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  party_size: z.number().int().min(1).max(50),
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(1).max(30),
  dietary_notes: z.string().max(1000).optional(),
  occasion: z.string().max(200).optional(),
  source: z.enum(['online', 'phone', 'walk-in']),
});

/** Compute cancellation_deadline: booking datetime minus 48 hours (Europe/London). */
function cancellationDeadline(bookingDate: string, bookingTime: string): string {
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - 48);
  return dt.toISOString();
}

/**
 * POST /api/booking/create
 * Public. Creates guest (or matches), creates booking. If deposit required for source,
 * creates Stripe PaymentIntent on venue's connected account and returns client_secret.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createBookingSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const {
      venue_id,
      booking_date,
      booking_time,
      party_size,
      name,
      email,
      phone,
      dietary_notes,
      occasion,
      source,
    } = parsed.data;

    const supabase = getSupabaseAdminClient();

    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('id, name, stripe_connected_account_id, booking_rules, deposit_config')
      .eq('id', venue_id)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const rules = (venue.booking_rules as { min_party_size?: number; max_party_size?: number }) ?? {};
    const minParty = rules.min_party_size ?? 1;
    const maxParty = rules.max_party_size ?? 50;
    if (party_size < minParty || party_size > maxParty) {
      return NextResponse.json(
        { error: `Party size must be between ${minParty} and ${maxParty}` },
        { status: 400 }
      );
    }

    const depositConfig = (venue.deposit_config as { enabled?: boolean; amount_per_person_gbp?: number; online_requires_deposit?: boolean; phone_requires_deposit?: boolean }) ?? {};
    const depositEnabled = depositConfig.enabled ?? false;
    const amountPerPersonGbp = depositConfig.amount_per_person_gbp ?? 5;
    const onlineRequiresDeposit = depositConfig.online_requires_deposit !== false;
    const phoneRequiresDeposit = depositConfig.phone_requires_deposit ?? false;

    const requiresDeposit =
      source === 'online' && depositEnabled && onlineRequiresDeposit ||
      source === 'phone' && depositEnabled && phoneRequiresDeposit;

    const depositAmountPence = requiresDeposit ? Math.round(amountPerPersonGbp * party_size * 100) : null;

    if (requiresDeposit && !venue.stripe_connected_account_id) {
      return NextResponse.json(
        { error: 'Venue has not set up payments; deposits are required for this booking type.' },
        { status: 400 }
      );
    }

    const { guest, created: guestCreated } = await findOrCreateGuest(supabase, venue_id, {
      name,
      email: email || null,
      phone,
    });

    const cancellation_deadline = cancellationDeadline(booking_date, booking_time);
    const timeForDb = booking_time.length === 5 ? booking_time + ':00' : booking_time;

    const bookingInsert: Record<string, unknown> = {
      venue_id,
      guest_id: guest.id,
      booking_date,
      booking_time: timeForDb,
      party_size,
      status: requiresDeposit ? 'Pending' : 'Confirmed',
      source,
      dietary_notes: dietary_notes || null,
      occasion: occasion || null,
      deposit_amount_pence: depositAmountPence,
      deposit_status: requiresDeposit ? 'Pending' : 'Not Required',
      cancellation_deadline,
    };

    const { data: booking, error: bookErr } = await supabase
      .from('bookings')
      .insert(bookingInsert)
      .select('id, status, deposit_status')
      .single();

    if (bookErr) {
      console.error('Booking insert failed:', bookErr);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    let client_secret: string | null = null;

    if (requiresDeposit && depositAmountPence != null && depositAmountPence > 0 && venue.stripe_connected_account_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: depositAmountPence,
            currency: 'gbp',
            metadata: { booking_id: booking.id, venue_id },
            automatic_payment_methods: { enabled: true },
          },
          { stripeAccount: venue.stripe_connected_account_id }
        );
        client_secret = paymentIntent.client_secret;

        await supabase
          .from('bookings')
          .update({
            stripe_payment_intent_id: paymentIntent.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.id);
      } catch (stripeErr) {
        console.error('PaymentIntent create failed:', stripeErr);
        await supabase.from('bookings').delete().eq('id', booking.id);
        return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
      }
    }

    if (!requiresDeposit) {
      await sendCommunication({
        type: 'booking_confirmation',
        recipient: { email: guest.email ?? undefined, phone: guest.phone ?? undefined },
        payload: {
          guest_name: name,
          venue_name: venue.name,
          booking_date,
          booking_time,
          party_size,
          cancellation_deadline,
        },
      });
    }

    return NextResponse.json(
      {
        booking_id: booking.id,
        requires_deposit: requiresDeposit,
        client_secret: client_secret ?? undefined,
        status: booking.status,
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/booking/create failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

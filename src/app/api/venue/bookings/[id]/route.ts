import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { getAvailableSlots } from '@/lib/availability';
import type { VenueForAvailability, BookingForAvailability } from '@/types/availability';
import { z } from 'zod';

const statusSchema = z.enum(['Pending', 'Confirmed', 'Cancelled', 'No-Show', 'Completed', 'Seated']);

/** GET /api/venue/bookings/[id] — full booking detail with guest and events timeline. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;

    const { data: booking, error: bookErr } = await staff.db
      .from('bookings')
      .select('*')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .single();

    if (bookErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const { data: guest } = await staff.db
      .from('guests')
      .select('id, name, email, phone, visit_count')
      .eq('id', booking.guest_id)
      .single();

    const { data: events } = await staff.db
      .from('events')
      .select('id, event_type, payload, created_at')
      .eq('booking_id', id)
      .order('created_at', { ascending: true });

    const { data: communications } = await staff.db
      .from('communications')
      .select('id, message_type, channel, status, created_at')
      .eq('booking_id', id)
      .order('created_at', { ascending: true });

    const bookingTimeStr = typeof booking.booking_time === 'string'
      ? booking.booking_time.slice(0, 5)
      : '';

    return NextResponse.json({
      ...booking,
      booking_time: bookingTimeStr,
      guest: guest ?? null,
      events: events ?? [],
      communications: communications ?? [],
    });
  } catch (err) {
    console.error('GET /api/venue/bookings/[id] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/bookings/[id] — status change or modify date/time/party_size. */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { id } = await params;
    const body = await request.json();

    const { data: booking, error: fetchErr } = await staff.db
      .from('bookings')
      .select('*')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .single();

    if (fetchErr || !booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const admin = getSupabaseAdminClient();

    if (body.status !== undefined) {
      const parsed = statusSchema.safeParse(body.status);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid status' }, { status: 400 });
      }
      const newStatus = parsed.data;

      const validTransitions: Record<string, string[]> = {
        Pending: ['Confirmed', 'Cancelled'],
        Confirmed: ['Seated', 'No-Show', 'Cancelled'],
        Seated: ['Completed', 'No-Show'],
        Completed: [],
        'No-Show': [],
        Cancelled: [],
      };
      const allowed = validTransitions[booking.status as string];
      if (!allowed?.includes(newStatus)) {
        return NextResponse.json(
          { error: `Cannot change status from ${booking.status} to ${newStatus}` },
          { status: 400 }
        );
      }

      if (newStatus === 'Cancelled' && (booking.status === 'Confirmed' || booking.status === 'Pending')) {
        const deadline = booking.cancellation_deadline ? new Date(booking.cancellation_deadline) : null;
        const canRefund = deadline && new Date() <= deadline && booking.deposit_status === 'Paid' && booking.stripe_payment_intent_id;

        let refundSucceeded = false;
        if (canRefund) {
          const { data: venue } = await admin.from('venues').select('stripe_connected_account_id').eq('id', staff.venue_id).single();
          if (venue?.stripe_connected_account_id) {
            try {
              await stripe.refunds.create(
                { payment_intent: booking.stripe_payment_intent_id },
                { stripeAccount: venue.stripe_connected_account_id }
              );
              refundSucceeded = true;
            } catch (refundErr) {
              console.error('Refund failed:', refundErr);
            }
          }
        }

        await staff.db
          .from('bookings')
          .update({
            status: 'Cancelled',
            deposit_status: refundSucceeded ? 'Refunded' : booking.deposit_status,
            updated_at: new Date().toISOString(),
          })
          .eq('id', id);

        // Send cancellation confirmation to guest
        const { sendCommunication } = await import('@/lib/communications');
        const { data: guestRow } = await staff.db.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
        const { data: venueRow } = await staff.db.from('venues').select('name').eq('id', staff.venue_id).single();
        if (guestRow && venueRow?.name) {
          const depositAmountStr = booking.deposit_amount_pence
            ? `£${(booking.deposit_amount_pence / 100).toFixed(2)}`
            : null;
          let refund_message: string | undefined;
          if (refundSucceeded) {
            refund_message = `Your deposit of ${depositAmountStr} will be refunded to your original payment method within 5–10 business days.`;
          } else if (booking.deposit_status === 'Paid' && !canRefund) {
            refund_message = `Your deposit of ${depositAmountStr} is non-refundable as the cancellation was made less than 48 hours before the reservation.`;
          } else if (booking.deposit_status === 'Paid' && canRefund && !refundSucceeded) {
            refund_message = `We were unable to process your refund automatically. Please contact the venue directly to arrange your refund of ${depositAmountStr}.`;
          }
          const bookingTime = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';
          try {
            await sendCommunication({
              type: 'cancellation_confirmation',
              recipient: { email: guestRow.email ?? undefined, phone: guestRow.phone ?? undefined },
              payload: {
                guest_name: guestRow.name ?? 'Guest',
                venue_name: venueRow.name,
                booking_date: booking.booking_date,
                booking_time: bookingTime,
                party_size: booking.party_size,
                refund_message,
              },
            });
          } catch (commsErr) {
            console.error('Staff cancellation notification failed:', commsErr);
          }
        }
      } else if (newStatus === 'No-Show') {
        const depositStatus = booking.deposit_status === 'Paid' ? 'Forfeited' : booking.deposit_status;
        await staff.db
          .from('bookings')
          .update({ status: 'No-Show', deposit_status: depositStatus, updated_at: new Date().toISOString() })
          .eq('id', id);
        const { sendCommunication } = await import('@/lib/communications');
        const { data: guestRow } = await staff.db.from('guests').select('name, email').eq('id', booking.guest_id).single();
        const { data: venueRow } = await staff.db.from('venues').select('name').eq('id', staff.venue_id).single();
        if (guestRow?.email && venueRow?.name) {
          const depositAmount = booking.deposit_amount_pence != null ? (booking.deposit_amount_pence / 100).toFixed(2) : undefined;
          const bookingTime = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';
          try {
            await sendCommunication({
              type: 'no_show_notification',
              recipient: { email: guestRow.email },
              payload: {
                guest_name: guestRow.name ?? 'Guest',
                venue_name: venueRow.name,
                booking_date: booking.booking_date,
                booking_time: bookingTime,
                deposit_amount: depositStatus === 'Forfeited' ? depositAmount : undefined,
              },
            });
          } catch (commsErr) {
            console.error('No-show notification failed:', commsErr);
          }
        }
      } else {
        await staff.db
          .from('bookings')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (newStatus === 'Seated') {
          const today = new Date().toISOString().slice(0, 10);
          const { data: guestData } = await admin.from('guests').select('visit_count').eq('id', booking.guest_id).single();
          await admin
            .from('guests')
            .update({
              visit_count: (guestData?.visit_count ?? 0) + 1,
              last_visit_date: today,
              updated_at: new Date().toISOString(),
            })
            .eq('id', booking.guest_id);
        }
      }

      if (newStatus === 'No-Show') {
        const { data: guestData } = await admin.from('guests').select('no_show_count').eq('id', booking.guest_id).single();
        await admin
          .from('guests')
          .update({
            no_show_count: (guestData?.no_show_count ?? 0) + 1,
            updated_at: new Date().toISOString(),
          })
          .eq('id', booking.guest_id);
      }

      const updated = await staff.db.from('bookings').select('*').eq('id', id).single();
      return NextResponse.json(updated.data);
    }

    if (body.booking_date !== undefined || body.booking_time !== undefined || body.party_size !== undefined) {
      const newDate = (body.booking_date as string) ?? booking.booking_date;
      const newTimeRaw = (body.booking_time as string) ?? (typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '12:00');
      const newTime = newTimeRaw.length === 5 ? newTimeRaw + ':00' : newTimeRaw;
      const newPartySize = body.party_size !== undefined ? Number(body.party_size) : booking.party_size;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newPartySize < 1 || newPartySize > 50) {
        return NextResponse.json({ error: 'Invalid date or party size' }, { status: 400 });
      }

      const { data: venue } = await admin.from('venues').select('id, opening_hours, availability_config, timezone').eq('id', staff.venue_id).single();
      if (!venue) {
        return NextResponse.json({ error: 'Venue not found' }, { status: 500 });
      }

      const { data: allBookings } = await admin
        .from('bookings')
        .select('id, booking_date, booking_time, party_size, status')
        .eq('venue_id', staff.venue_id)
        .eq('booking_date', newDate);

      const bookingsForAvail: BookingForAvailability[] = (allBookings ?? [])
        .filter((b: { id: string }) => b.id !== id)
        .filter((b: { status: string }) => ['Confirmed', 'Pending'].includes(b.status))
        .map((b: { id: string; booking_date: string; booking_time: string; party_size: number; status: string }) => ({
          id: b.id,
          booking_date: b.booking_date,
          booking_time: typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '00:00',
          party_size: b.party_size,
          status: b.status,
        }));

      const venueForAvail: VenueForAvailability = {
        id: venue.id,
        opening_hours: venue.opening_hours,
        availability_config: venue.availability_config,
        timezone: venue.timezone ?? 'Europe/London',
      };

      const slots = getAvailableSlots(venueForAvail, newDate, bookingsForAvail);
      const timeStr = newTime.slice(0, 5);
      const slot = slots.find((s) => s.start_time === timeStr || s.key === timeStr);
      if (!slot || slot.available_covers < newPartySize) {
        return NextResponse.json(
          { error: 'Selected date/time is not available or has insufficient capacity' },
          { status: 409 }
        );
      }

      const before = {
        booking_date: booking.booking_date,
        booking_time: typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '',
        party_size: booking.party_size,
      };

      const bookingUpdate: Record<string, unknown> = {
        booking_date: newDate,
        booking_time: newTime,
        party_size: newPartySize,
        updated_at: new Date().toISOString(),
      };

      let additionalDepositClientSecret: string | null = null;

      if (newPartySize > booking.party_size && booking.deposit_status === 'Paid' && booking.deposit_amount_pence) {
        const { data: venueForDeposit } = await admin
          .from('venues')
          .select('deposit_config, stripe_connected_account_id')
          .eq('id', staff.venue_id)
          .single();

        const depCfg = (venueForDeposit?.deposit_config as { amount_per_person_gbp?: number }) ?? {};
        const perPersonGbp = depCfg.amount_per_person_gbp ?? 5;
        const additionalCovers = newPartySize - booking.party_size;
        const additionalPence = Math.round(perPersonGbp * additionalCovers * 100);

        if (additionalPence > 0 && venueForDeposit?.stripe_connected_account_id) {
          try {
            const pi = await stripe.paymentIntents.create(
              {
                amount: additionalPence,
                currency: 'gbp',
                metadata: { booking_id: id, venue_id: staff.venue_id, type: 'additional_deposit' },
                automatic_payment_methods: { enabled: true },
              },
              { stripeAccount: venueForDeposit.stripe_connected_account_id }
            );
            additionalDepositClientSecret = pi.client_secret;
            bookingUpdate.deposit_amount_pence = booking.deposit_amount_pence + additionalPence;
            bookingUpdate.deposit_status = 'Pending';
          } catch (stripeErr) {
            console.error('Additional deposit PI failed:', stripeErr);
          }
        }
      }

      await staff.db
        .from('bookings')
        .update(bookingUpdate)
        .eq('id', id);

      await admin.from('events').insert({
        venue_id: staff.venue_id,
        booking_id: id,
        event_type: 'booking_modified',
        payload: { before, after: { booking_date: newDate, booking_time: timeStr, party_size: newPartySize } },
      });

      const { data: guestRow } = await staff.db.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
      const { data: venueRow } = await staff.db.from('venues').select('name').eq('id', staff.venue_id).single();
      if (guestRow?.email && venueRow?.name) {
        const { sendCommunication } = await import('@/lib/communications');
        const depositAmount = booking.deposit_amount_pence != null ? (booking.deposit_amount_pence / 100).toFixed(2) : undefined;
        try {
          await sendCommunication({
            type: 'booking_modification',
            recipient: { email: guestRow.email, phone: guestRow.phone ?? undefined },
            payload: {
              guest_name: guestRow.name ?? 'Guest',
              venue_name: venueRow.name,
              booking_date: newDate,
              booking_time: timeStr,
              party_size: newPartySize,
              deposit_amount: depositAmount,
            },
          });
        } catch (commsErr) {
          console.error('Booking modification notification failed:', commsErr);
        }
      }

      const updated = await staff.db.from('bookings').select('*').eq('id', id).single();
      return NextResponse.json(updated.data);
    }

    return NextResponse.json({ error: 'Provide status or booking_date/booking_time/party_size' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/venue/bookings/[id] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

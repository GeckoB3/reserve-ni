import { NextRequest, NextResponse, after } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { findOrCreateGuest } from '@/lib/guests';
import { sendBookingConfirmationEmail } from '@/lib/communications/send-templated';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import { normalizeToE164 } from '@/lib/phone/e164';
import { resolveVenueMode } from '@/lib/venue-mode';
import {
  fetchAppointmentInput,
  computeAppointmentAvailability,
  type PhantomBooking,
} from '@/lib/availability/appointment-engine';
import { z } from 'zod';
import { randomUUID } from 'crypto';

const personEntrySchema = z.object({
  person_label: z.string().min(1).max(100),
  practitioner_id: z.string().uuid(),
  appointment_service_id: z.string().uuid(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
});

const createGroupSchema = z.object({
  venue_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().min(1).max(24),
  source: z.enum(['online', 'phone', 'walk-in', 'widget', 'booking_page']),
  people: z.array(personEntrySchema).min(1).max(10),
});

function cancellationDeadline(bookingDate: string, bookingTime: string): string {
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - 48);
  return dt.toISOString();
}

/**
 * POST /api/booking/create-group
 * Creates multiple linked appointment bookings for a group (Fresha-style).
 * All bookings share a group_booking_id, single guest contact, single Stripe payment.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createGroupSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { venue_id, name, email, phone, source, people } = parsed.data;

    const phoneE164 = normalizeToE164(phone, 'GB');
    if (!phoneE164) {
      return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
    }

    const supabase = getSupabaseAdminClient();

    const { data: venue, error: venueErr } = await supabase
      .from('venues')
      .select('id, name, stripe_connected_account_id, address')
      .eq('id', venue_id)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 404 });
    }

    const venueMode = await resolveVenueMode(supabase, venue_id);
    if (venueMode.bookingModel !== 'practitioner_appointment') {
      return NextResponse.json({ error: 'Group bookings are only available for appointment businesses' }, { status: 400 });
    }

    // Validate each person's slot, using phantom bookings for already-validated ones
    const validatedPeople: Array<{
      person_label: string;
      practitioner_id: string;
      appointment_service_id: string;
      booking_date: string;
      booking_time: string;
      duration_minutes: number;
      buffer_minutes: number;
      deposit_pence: number;
      estimated_end_time: string | null;
    }> = [];

    const phantoms: PhantomBooking[] = [];

    for (let i = 0; i < people.length; i++) {
      const person = people[i]!;
      const timeStr = person.booking_time.slice(0, 5);

      const input = await fetchAppointmentInput({
        supabase,
        venueId: venue_id,
        date: person.booking_date,
        practitionerId: person.practitioner_id,
        serviceId: person.appointment_service_id,
      });

      // Inject phantom bookings for same-date slots
      const sameDatePhantoms = phantoms.filter((p) =>
        // phantoms are always for the same date since we fetched by person.booking_date
        true
      );
      input.phantomBookings = sameDatePhantoms;

      const result = computeAppointmentAvailability(input);
      const prac = result.practitioners.find((p) => p.id === person.practitioner_id);
      const slotAvailable = prac?.slots.some(
        (s) => s.start_time === timeStr && s.service_id === person.appointment_service_id
      );

      if (!slotAvailable) {
        return NextResponse.json(
          { error: `Slot for ${person.person_label} at ${timeStr} is no longer available` },
          { status: 409 }
        );
      }

      const svc = input.services.find((s) => s.id === person.appointment_service_id);
      const durationMins = svc?.duration_minutes ?? 30;
      const bufferMins = svc?.buffer_minutes ?? 0;
      let estimatedEndTime: string | null = null;
      let depositPence = 0;

      if (svc) {
        const [y, mo, d] = person.booking_date.split('-').map(Number);
        const [hh, mm] = timeStr.split(':').map(Number);
        const endDate = new Date(Date.UTC(y!, mo! - 1, d!, hh!, mm!, 0));
        endDate.setMinutes(endDate.getMinutes() + svc.duration_minutes);
        estimatedEndTime = endDate.toISOString();

        if (svc.deposit_pence != null && svc.deposit_pence > 0) {
          depositPence = svc.deposit_pence;
        }
      }

      validatedPeople.push({
        person_label: person.person_label,
        practitioner_id: person.practitioner_id,
        appointment_service_id: person.appointment_service_id,
        booking_date: person.booking_date,
        booking_time: timeStr,
        duration_minutes: durationMins,
        buffer_minutes: bufferMins,
        deposit_pence: depositPence,
        estimated_end_time: estimatedEndTime,
      });

      phantoms.push({
        practitioner_id: person.practitioner_id,
        start_time: timeStr,
        duration_minutes: durationMins,
        buffer_minutes: bufferMins,
      });
    }

    const totalDepositPence = validatedPeople.reduce((sum, p) => sum + p.deposit_pence, 0);
    const requiresDeposit = totalDepositPence > 0;

    if (requiresDeposit && !venue.stripe_connected_account_id) {
      return NextResponse.json(
        { error: 'Venue has not set up payments; deposits are required for these services.' },
        { status: 400 }
      );
    }

    const { guest } = await findOrCreateGuest(supabase, venue_id, {
      name,
      email: email || null,
      phone: phoneE164,
    });

    const groupBookingId = randomUUID();
    const bookingIds: string[] = [];

    for (const person of validatedPeople) {
      const timeForDb = person.booking_time + ':00';
      const deadline = cancellationDeadline(person.booking_date, person.booking_time);
      const policySnapshot = {
        refund_window_hours: 48,
        policy: 'Full refund if cancelled 48+ hours before. No refund within 48 hours or for no-shows.',
      };

      const insert: Record<string, unknown> = {
        venue_id,
        guest_id: guest.id,
        booking_date: person.booking_date,
        booking_time: timeForDb,
        party_size: 1,
        status: requiresDeposit ? 'Pending' : 'Confirmed',
        source,
        guest_email: email || null,
        deposit_amount_pence: person.deposit_pence > 0 ? person.deposit_pence : null,
        deposit_status: person.deposit_pence > 0 ? 'Pending' : 'Not Required',
        cancellation_deadline: deadline,
        cancellation_policy_snapshot: policySnapshot,
        estimated_end_time: person.estimated_end_time,
        practitioner_id: person.practitioner_id,
        appointment_service_id: person.appointment_service_id,
        group_booking_id: groupBookingId,
        person_label: person.person_label,
      };

      const { data: booking, error: bookErr } = await supabase
        .from('bookings')
        .insert(insert)
        .select('id')
        .single();

      if (bookErr) {
        console.error('Group booking insert failed:', bookErr);
        // Clean up already-created bookings
        if (bookingIds.length > 0) {
          await supabase.from('bookings').delete().in('id', bookingIds);
        }
        return NextResponse.json({ error: 'Failed to create group booking' }, { status: 500 });
      }

      bookingIds.push(booking.id);
    }

    let client_secret: string | null = null;

    if (requiresDeposit && totalDepositPence > 0 && venue.stripe_connected_account_id) {
      try {
        const paymentIntent = await stripe.paymentIntents.create(
          {
            amount: totalDepositPence,
            currency: 'gbp',
            metadata: {
              group_booking_id: groupBookingId,
              booking_ids: bookingIds.join(','),
              venue_id,
            },
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
          .in('id', bookingIds);
      } catch (stripeErr) {
        console.error('Group PaymentIntent create failed:', stripeErr);
        await supabase.from('bookings').delete().in('id', bookingIds);
        return NextResponse.json({ error: 'Payment setup failed' }, { status: 500 });
      }
    }

    if (!requiresDeposit && guest.email) {
      const manageToken = generateConfirmToken();
      const primaryBookingId = bookingIds[0]!;
      await supabase
        .from('bookings')
        .update({
          confirm_token_hash: hashConfirmToken(manageToken),
          updated_at: new Date().toISOString(),
        })
        .eq('id', primaryBookingId);

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
      const manageBookingLink = `${baseUrl}/manage/${primaryBookingId}/${encodeURIComponent(manageToken)}`;

      const firstPerson = validatedPeople[0]!;
      after(async () => {
        try {
          await sendBookingConfirmationEmail(
            {
              id: primaryBookingId,
              guest_name: name,
              guest_email: guest.email!,
              booking_date: firstPerson.booking_date,
              booking_time: firstPerson.booking_time,
              party_size: validatedPeople.length,
              dietary_notes: null,
              deposit_amount_pence: null,
              deposit_status: 'Not Required',
              manage_booking_link: manageBookingLink,
            },
            { name: venue.name, address: venue.address ?? undefined },
            venue_id,
          );
        } catch (err) {
          console.error('[after] group confirmation email failed:', err);
        }
      });
    }

    return NextResponse.json(
      {
        group_booking_id: groupBookingId,
        booking_ids: bookingIds,
        requires_deposit: requiresDeposit,
        total_deposit_pence: totalDepositPence,
        client_secret: client_secret ?? undefined,
        stripe_account_id: requiresDeposit ? venue.stripe_connected_account_id : undefined,
        status: requiresDeposit ? 'Pending' : 'Confirmed',
      },
      { status: 201 }
    );
  } catch (err) {
    console.error('POST /api/booking/create-group failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

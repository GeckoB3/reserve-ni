import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { computeAvailability, fetchEngineInput } from '@/lib/availability';
import { AVAILABILITY_SETUP_REQUIRED_MESSAGE } from '@/lib/availability/availability-errors';
import { fetchAppointmentInput, computeAppointmentAvailability } from '@/lib/availability/appointment-engine';
import { autoAssignTable } from '@/lib/table-availability';
import { BOOKING_MUTABLE_STATUSES } from '@/lib/table-management/constants';
import {
  applyBookingLifecycleStatusEffects,
  clearTableStatusesForBooking,
  getAssignedTableIds,
  replaceBookingAssignments,
  syncTableStatusesForBooking,
  validateBookingStatusTransition,
  validateNoShowGracePeriod,
  validateTablesBelongToVenue,
} from '@/lib/table-management/lifecycle';
import { resolveVenueMode } from '@/lib/venue-mode';
import { z } from 'zod';
import { normalizeToE164 } from '@/lib/phone/e164';

const statusSchema = z.enum(BOOKING_MUTABLE_STATUSES);

function cancellationDeadline(bookingDate: string, bookingTime: string): string {
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - 48);
  return dt.toISOString();
}

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

    const { data: tableAssignments } = await staff.db
      .from('booking_table_assignments')
      .select('table_id, table:venue_tables(id, name)')
      .eq('booking_id', id);

    const assignedTables = (tableAssignments ?? []).map((a: { table_id: string; table: unknown }) => {
      const tbl = a.table as { id: string; name: string } | null;
      return { id: tbl?.id ?? a.table_id, name: tbl?.name ?? 'Unknown' };
    });

    return NextResponse.json({
      ...booking,
      booking_time: bookingTimeStr,
      guest: guest ?? null,
      events: events ?? [],
      communications: communications ?? [],
      table_assignments: assignedTables,
    });
  } catch (err) {
    console.error('GET /api/venue/bookings/[id] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/bookings/[id] — status change or modify booking fields. */
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

      const transitionCheck = validateBookingStatusTransition(booking.status as string, newStatus);
      if (!transitionCheck.ok) {
        return NextResponse.json({ error: transitionCheck.error }, { status: 400 });
      }

      if (newStatus === 'No-Show') {
        const { data: venueGrace } = await admin.from('venues').select('no_show_grace_minutes').eq('id', staff.venue_id).single();
        const graceMinutes = venueGrace?.no_show_grace_minutes ?? 15;
        const bookingTimeStr = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '00:00';
        const graceCheck = validateNoShowGracePeriod(booking.booking_date, bookingTimeStr, graceMinutes);
        if (!graceCheck.ok) {
          return NextResponse.json({ error: graceCheck.error }, { status: 400 });
        }
      }

      if (newStatus === 'Cancelled' && (booking.status === 'Confirmed' || booking.status === 'Pending' || booking.status === 'Seated')) {
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

        const { data: guestRow } = await staff.db.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
        const { data: venueRow } = await staff.db.from('venues').select('name, address, phone').eq('id', staff.venue_id).single();
        if (guestRow && venueRow?.name) {
          const depositAmountStr = booking.deposit_amount_pence
            ? `£${(booking.deposit_amount_pence / 100).toFixed(2)}`
            : null;
          let refund_message: string | undefined;
          if (refundSucceeded) {
            refund_message = `Your deposit of ${depositAmountStr} will be refunded to your original payment method within 5\u201310 business days.`;
          } else if (booking.deposit_status === 'Paid' && !canRefund) {
            refund_message = `Your deposit of ${depositAmountStr} is non-refundable as the cancellation was made less than 48 hours before the reservation.`;
          } else if (booking.deposit_status === 'Paid' && canRefund && !refundSucceeded) {
            refund_message = `We were unable to process your refund automatically. Please contact the venue directly to arrange your refund of ${depositAmountStr}.`;
          }
          const bookingTime = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';
          const { sendCancellationNotification } = await import('@/lib/communications/send-templated');
          const cancelBookingEmail: import('@/lib/emails/types').BookingEmailData = {
            id,
            guest_name: guestRow.name ?? 'Guest',
            guest_email: guestRow.email ?? null,
            guest_phone: guestRow.phone ?? null,
            booking_date: booking.booking_date,
            booking_time: bookingTime,
            party_size: booking.party_size,
            deposit_amount_pence: booking.deposit_amount_pence ?? null,
            deposit_status: booking.deposit_status ?? null,
          };
          const cancelVenueEmail: import('@/lib/emails/types').VenueEmailData = {
            name: venueRow.name,
            address: venueRow.address ?? null,
            phone: venueRow.phone ?? null,
          };
          const vid = staff.venue_id;
          const refundMsg = refund_message;
          after(async () => {
            try {
              await sendCancellationNotification(cancelBookingEmail, cancelVenueEmail, vid, refundMsg);
            } catch (commsErr) {
              console.error('Staff cancellation notification failed:', commsErr);
            }
          });
        }
      } else if (newStatus === 'No-Show') {
        const depositStatus = booking.deposit_status === 'Paid' ? 'Forfeited' : booking.deposit_status;
        await staff.db
          .from('bookings')
          .update({ status: 'No-Show', deposit_status: depositStatus, updated_at: new Date().toISOString() })
          .eq('id', id);
      } else {
        await staff.db
          .from('bookings')
          .update({ status: newStatus, updated_at: new Date().toISOString() })
          .eq('id', id);

        if (booking.status === 'Pending' && newStatus === 'Confirmed') {
          const { sendBookingConfirmationEmail } = await import('@/lib/communications/send-templated');
          const { data: guestRow } = await staff.db.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
          const { data: venueRow } = await staff.db.from('venues').select('name, address').eq('id', staff.venue_id).single();
          if (guestRow?.email && venueRow?.name) {
            const bookingTime = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';
            const emailData = {
              id,
              guest_name: guestRow.name ?? 'Guest',
              guest_email: guestRow.email,
              booking_date: booking.booking_date,
              booking_time: bookingTime,
              party_size: booking.party_size,
            };
            const venueEmailData = { name: venueRow.name, address: venueRow.address ?? undefined };
            const vid = staff.venue_id;
            after(async () => {
              try {
                const result = await sendBookingConfirmationEmail(emailData, venueEmailData, vid);
                if (!result.sent) console.warn('[after] status-confirm email not sent:', result.reason);
              } catch (err) {
                console.error('[after] status-confirm email failed:', err);
              }
            });
          }
        }

      }

      await applyBookingLifecycleStatusEffects(admin, {
        bookingId: id,
        guestId: booking.guest_id,
        previousStatus: booking.status as string,
        nextStatus: newStatus,
        actorId: staff.id,
      });

      if (newStatus === 'Seated' && Array.isArray(body.table_ids) && body.table_ids.length > 0) {
        const tableIds = body.table_ids as string[];
        const valid = await validateTablesBelongToVenue(admin, staff.venue_id, tableIds);
        if (valid) {
          await replaceBookingAssignments(admin, id, tableIds, staff.id);
          await syncTableStatusesForBooking(admin, id, tableIds, newStatus, staff.id);
        }
      }

      const updated = await staff.db.from('bookings').select('*').eq('id', id).single();
      return NextResponse.json(updated.data);
    }

    if (
      body.special_requests !== undefined ||
      body.internal_notes !== undefined ||
      body.dietary_notes !== undefined ||
      body.occasion !== undefined ||
      body.guest_name !== undefined ||
      body.guest_phone !== undefined ||
      body.guest_email !== undefined
    ) {
      const bookingUpdatePayload: Record<string, unknown> = {
        updated_at: new Date().toISOString(),
      };
      let hasBookingUpdate = false;
      if (body.special_requests !== undefined) {
        bookingUpdatePayload.special_requests = typeof body.special_requests === 'string' ? body.special_requests : null;
        hasBookingUpdate = true;
      }
      if (body.internal_notes !== undefined) {
        bookingUpdatePayload.internal_notes = typeof body.internal_notes === 'string' ? body.internal_notes : null;
        hasBookingUpdate = true;
      }
      if (body.dietary_notes !== undefined) {
        bookingUpdatePayload.dietary_notes = typeof body.dietary_notes === 'string' ? body.dietary_notes : null;
        hasBookingUpdate = true;
      }
      if (body.occasion !== undefined) {
        bookingUpdatePayload.occasion = typeof body.occasion === 'string' ? body.occasion : null;
        hasBookingUpdate = true;
      }
      if (hasBookingUpdate) {
        await staff.db
          .from('bookings')
          .update(bookingUpdatePayload)
          .eq('id', id)
          .eq('venue_id', staff.venue_id);
      }

      if (body.guest_name !== undefined || body.guest_phone !== undefined || body.guest_email !== undefined) {
        const guestUpdatePayload: Record<string, unknown> = {
          updated_at: new Date().toISOString(),
        };
        if (body.guest_name !== undefined) {
          guestUpdatePayload.name = typeof body.guest_name === 'string' && body.guest_name.trim() ? body.guest_name.trim() : null;
        }
        if (body.guest_phone !== undefined) {
          const raw = typeof body.guest_phone === 'string' ? body.guest_phone.trim() : '';
          if (!raw) {
            guestUpdatePayload.phone = null;
          } else {
            const e164 = normalizeToE164(raw, 'GB');
            if (!e164) {
              return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
            }
            guestUpdatePayload.phone = e164;
          }
        }
        if (body.guest_email !== undefined) {
          guestUpdatePayload.email = typeof body.guest_email === 'string' && body.guest_email.trim() ? body.guest_email.trim() : null;
        }
        await staff.db.from('guests').update(guestUpdatePayload).eq('id', booking.guest_id);
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

      const timeStr = newTime.slice(0, 5);
      const isAppointment = Boolean(booking.practitioner_id);

      // --- Validate slot availability ---
      if (isAppointment) {
        const practId = (body.practitioner_id as string) ?? booking.practitioner_id;
        const svcId = booking.appointment_service_id;
        const apptInput = await fetchAppointmentInput({
          supabase: admin,
          venueId: staff.venue_id,
          date: newDate,
          practitionerId: practId ?? undefined,
          serviceId: svcId ?? undefined,
        });
        apptInput.existingBookings = apptInput.existingBookings.filter((b) => b.id !== id);
        const apptResult = computeAppointmentAvailability(apptInput);
        const practSlots = apptResult.practitioners.find((p) => p.id === practId);
        const matchSlot = practSlots?.slots.find(
          (s) => s.start_time === timeStr && (!svcId || s.service_id === svcId),
        );
        if (!matchSlot) {
          return NextResponse.json(
            { error: 'Selected date/time is not available for this practitioner' },
            { status: 409 },
          );
        }
      } else {
        const venueMode = await resolveVenueMode(admin, staff.venue_id);
        if (venueMode.availabilityEngine !== 'service') {
          return NextResponse.json({ error: AVAILABILITY_SETUP_REQUIRED_MESSAGE }, { status: 503 });
        }

        const engineInput = await fetchEngineInput({
          supabase: admin,
          venueId: staff.venue_id,
          date: newDate,
          partySize: newPartySize,
        });
        engineInput.bookings = engineInput.bookings.filter((b) => b.id !== id);
        const slots = computeAvailability(engineInput).flatMap((result) => result.slots);
        const slot = slots.find((s) => s.start_time === timeStr && (!booking.service_id || s.service_id === booking.service_id));
        if (!slot || slot.available_covers < newPartySize) {
          return NextResponse.json(
            { error: 'Selected date/time is not available or has insufficient capacity' },
            { status: 409 },
          );
        }
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
        cancellation_deadline: cancellationDeadline(newDate, timeStr),
      };

      if (body.practitioner_id && isAppointment) {
        bookingUpdate.practitioner_id = body.practitioner_id;
      }

      if (isAppointment && booking.appointment_service_id) {
        const { data: svcRow } = await admin
          .from('appointment_services')
          .select('duration_minutes')
          .eq('id', booking.appointment_service_id)
          .single();
        const svcDuration = svcRow?.duration_minutes ?? 30;
        const [ry, rmo, rd] = newDate.split('-').map(Number);
        const [rhh, rmm] = timeStr.split(':').map(Number);
        const rEnd = new Date(Date.UTC(ry!, rmo! - 1, rd!, rhh!, rmm!, 0));
        rEnd.setMinutes(rEnd.getMinutes() + svcDuration);
        bookingUpdate.estimated_end_time = rEnd.toISOString();
        bookingUpdate.booking_end_time = `${String(rEnd.getUTCHours()).padStart(2, '0')}:${String(rEnd.getUTCMinutes()).padStart(2, '0')}:00`;
      }

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
            await stripe.paymentIntents.create(
              {
                amount: additionalPence,
                currency: 'gbp',
                metadata: { booking_id: id, venue_id: staff.venue_id, type: 'additional_deposit' },
                automatic_payment_methods: { enabled: true },
              },
              { stripeAccount: venueForDeposit.stripe_connected_account_id }
            );
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

      const dateChanged = newDate !== booking.booking_date;
      const timeChanged = timeStr !== before.booking_time;
      const partySizeChanged = newPartySize !== booking.party_size;

      if (dateChanged || timeChanged || partySizeChanged) {
        const { data: venueForTables } = await admin
          .from('venues')
          .select('table_management_enabled')
          .eq('id', staff.venue_id)
          .single();

        if (venueForTables?.table_management_enabled) {
          await replaceBookingAssignments(admin, id, [], staff.id);
          await clearTableStatusesForBooking(admin, id, staff.id);

          await autoAssignTable(admin, staff.venue_id, id, newDate, timeStr, 90, 15, newPartySize);
          const nextAssigned = await getAssignedTableIds(admin, id);
          await syncTableStatusesForBooking(admin, id, nextAssigned, booking.status, staff.id);
        }
      }

      const { data: guestRow } = await staff.db.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
      const { data: venueRow } = await staff.db.from('venues').select('name, address, phone').eq('id', staff.venue_id).single();
      if (guestRow && venueRow?.name) {
        const { sendBookingModificationNotification } = await import('@/lib/communications/send-templated');
        const { createShortManageLink } = await import('@/lib/short-manage-link');
        const manageLink = createShortManageLink(id);
        const bookingEmail: import('@/lib/emails/types').BookingEmailData = {
          id,
          guest_name: guestRow.name ?? 'Guest',
          guest_email: guestRow.email ?? null,
          guest_phone: guestRow.phone ?? null,
          booking_date: newDate,
          booking_time: timeStr,
          party_size: newPartySize,
          deposit_amount_pence: booking.deposit_amount_pence ?? null,
          deposit_status: booking.deposit_status ?? null,
          manage_booking_link: manageLink,
        };
        const venueEmail: import('@/lib/emails/types').VenueEmailData = {
          name: venueRow.name,
          address: venueRow.address ?? null,
          phone: venueRow.phone ?? null,
        };
        const vid = staff.venue_id;
        after(async () => {
          try {
            await sendBookingModificationNotification(bookingEmail, venueEmail, vid);
          } catch (commsErr) {
            console.error('Booking modification notification failed:', commsErr);
          }
        });
      }

      // Reset scheduled communication logs so reminders re-trigger for the new date/time
      try {
        await admin
          .from('communication_logs')
          .delete()
          .eq('booking_id', id)
          .in('message_type', ['reminder_56h_email', 'day_of_reminder_sms', 'day_of_reminder_email', 'post_visit_email']);
      } catch (logResetErr) {
        console.error('Communication log reset failed after modification:', logResetErr);
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

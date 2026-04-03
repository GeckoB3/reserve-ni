import { NextRequest, NextResponse, after } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { stripe } from '@/lib/stripe';
import { computeAvailability, fetchEngineInput } from '@/lib/availability';
import { AVAILABILITY_SETUP_REQUIRED_MESSAGE } from '@/lib/availability/availability-errors';
import {
  attachVenueClockToAppointmentInput,
  fetchAppointmentInput,
  computeAppointmentAvailability,
} from '@/lib/availability/appointment-engine';
import { enrichBookingEmailForComms } from '@/lib/emails/booking-email-enrichment';
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
import { resolveTableAssignmentDurationBuffer } from '@/lib/table-management/booking-table-duration';
import { resolveVenueMode } from '@/lib/venue-mode';
import { z } from 'zod';
import { normalizeToE164 } from '@/lib/phone/e164';
import { getVenueNotificationSettings } from '@/lib/notifications/notification-settings';
import { communicationService } from '@/lib/communications';
import { inferBookingRowModel } from '@/lib/booking/infer-booking-row-model';
import { logBookingOp } from '@/lib/observability/booking-ops-log';
import { resolveCdeBookingContext } from '@/lib/booking/cde-booking-context';
import type { BookingModel } from '@/types/booking-models';

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
      .select('id, name, email, phone, visit_count, tags')
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

    const cde_context = await resolveCdeBookingContext(staff.db, booking as Parameters<typeof resolveCdeBookingContext>[1]);
    const inferred_booking_model = inferBookingRowModel(
      booking as {
        experience_event_id?: string | null;
        class_instance_id?: string | null;
        resource_id?: string | null;
        event_session_id?: string | null;
        calendar_id?: string | null;
        service_item_id?: string | null;
        practitioner_id?: string | null;
        appointment_service_id?: string | null;
      },
    );

    return NextResponse.json({
      ...booking,
      booking_time: bookingTimeStr,
      guest: guest ?? null,
      events: events ?? [],
      communications: communications ?? [],
      table_assignments: assignedTables,
      cde_context,
      inferred_booking_model: inferred_booking_model as BookingModel,
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

    if (body.ticket_lines !== undefined) {
      return NextResponse.json(
        {
          error:
            'Ticket line edits are not supported (v1). Cancel the booking if policy allows and create a new booking.',
        },
        { status: 400 },
      );
    }

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
        const groupBookingId = booking.group_booking_id as string | null | undefined;
        let idsToCancel: string[] = [id];
        let paymentIntentForRefund: string | null =
          typeof booking.stripe_payment_intent_id === 'string' ? booking.stripe_payment_intent_id : null;
        let depositPenceForMessage: number | null =
          typeof booking.deposit_amount_pence === 'number' ? booking.deposit_amount_pence : null;
        let hadPaidDeposit = booking.deposit_status === 'Paid';

        if (groupBookingId) {
          const { data: groupRows } = await staff.db
            .from('bookings')
            .select('id, stripe_payment_intent_id, deposit_status, deposit_amount_pence')
            .eq('venue_id', staff.venue_id)
            .eq('group_booking_id', groupBookingId)
            .in('status', ['Pending', 'Confirmed', 'Seated']);

          idsToCancel = (groupRows ?? []).map((r: { id: string }) => r.id);
          if (idsToCancel.length === 0) {
            idsToCancel = [id];
          }
          const withPi = (groupRows ?? []).find(
            (r: { stripe_payment_intent_id?: string | null }) => r.stripe_payment_intent_id,
          );
          paymentIntentForRefund =
            typeof withPi?.stripe_payment_intent_id === 'string' ? withPi.stripe_payment_intent_id : paymentIntentForRefund;
          const totalPence = (groupRows ?? []).reduce(
            (sum: number, r: { deposit_amount_pence?: number | null }) => sum + (r.deposit_amount_pence ?? 0),
            0,
          );
          if (totalPence > 0) {
            depositPenceForMessage = totalPence;
          }
          hadPaidDeposit = (groupRows ?? []).some((r: { deposit_status?: string | null }) => r.deposit_status === 'Paid');
        }

        const deadline = booking.cancellation_deadline ? new Date(booking.cancellation_deadline) : null;
        const canRefund =
          Boolean(deadline && new Date() <= deadline && hadPaidDeposit && paymentIntentForRefund);

        let refundSucceeded = false;
        if (canRefund && paymentIntentForRefund) {
          const { data: venue } = await admin.from('venues').select('stripe_connected_account_id').eq('id', staff.venue_id).single();
          if (venue?.stripe_connected_account_id) {
            try {
              await stripe.refunds.create(
                { payment_intent: paymentIntentForRefund },
                { stripeAccount: venue.stripe_connected_account_id },
              );
              refundSucceeded = true;
            } catch (refundErr) {
              logBookingOp({
                operation: 'refund_failed',
                venue_id: staff.venue_id,
                booking_id: id,
                booking_model: inferBookingRowModel(
                  booking as Parameters<typeof inferBookingRowModel>[0],
                ),
                error: refundErr instanceof Error ? refundErr.message : String(refundErr),
              });
            }
          }
        }

        if (refundSucceeded) {
          await staff.db
            .from('bookings')
            .update({
              status: 'Cancelled',
              deposit_status: 'Refunded',
              updated_at: new Date().toISOString(),
            })
            .in('id', idsToCancel);
        } else {
          await staff.db
            .from('bookings')
            .update({
              status: 'Cancelled',
              updated_at: new Date().toISOString(),
            })
            .in('id', idsToCancel);
        }

        logBookingOp({
          operation: 'cancel',
          venue_id: staff.venue_id,
          booking_id: id,
          booking_model: inferBookingRowModel(
            booking as Parameters<typeof inferBookingRowModel>[0],
          ),
        });

        const { data: guestRow } = await staff.db.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
        const { data: venueRow } = await staff.db.from('venues').select('name, address, phone').eq('id', staff.venue_id).single();
        if (guestRow && venueRow?.name) {
          const depositAmountStr = depositPenceForMessage
            ? `£${(depositPenceForMessage / 100).toFixed(2)}`
            : null;
          let refund_message: string | undefined;
          if (refundSucceeded) {
            refund_message = `Your deposit of ${depositAmountStr} will be refunded to your original payment method within 5\u201310 business days.`;
          } else if (hadPaidDeposit && !canRefund) {
            refund_message = `Your deposit of ${depositAmountStr} is non-refundable as the cancellation was made less than 48 hours before the reservation.`;
          } else if (hadPaidDeposit && canRefund && !refundSucceeded) {
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
            deposit_amount_pence: depositPenceForMessage ?? booking.deposit_amount_pence ?? null,
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
              const enriched = await enrichBookingEmailForComms(admin, id, cancelBookingEmail);
              await sendCancellationNotification(enriched, cancelVenueEmail, vid, refundMsg);
            } catch (commsErr) {
              console.error('Staff cancellation notification failed:', commsErr);
            }
          });
        }
      } else if (newStatus === 'No-Show') {
        const hadPaidDeposit = booking.deposit_status === 'Paid';
        const depositStatus = hadPaidDeposit ? 'Forfeited' : booking.deposit_status;
        await staff.db
          .from('bookings')
          .update({ status: 'No-Show', deposit_status: depositStatus, updated_at: new Date().toISOString() })
          .eq('id', id);

        const { data: guestNoShow } = await staff.db
          .from('guests')
          .select('name, email')
          .eq('id', booking.guest_id)
          .maybeSingle();
        const { data: venueNoShow } = await admin.from('venues').select('name').eq('id', staff.venue_id).maybeSingle();
        const nsNoShow = await getVenueNotificationSettings(staff.venue_id);
        if (guestNoShow?.email && venueNoShow?.name && nsNoShow.no_show_notification_enabled) {
          const bookingTimeNs = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';
          const venueIdNs = staff.venue_id;
          const bookingIdNs = id;
          const guestIdNs = booking.guest_id;
          after(async () => {
            try {
              await communicationService.send(
                'no_show_notification',
                { email: guestNoShow.email! },
                {
                  guest_name: guestNoShow.name ?? 'Guest',
                  venue_name: venueNoShow.name!,
                  booking_date: booking.booking_date,
                  booking_time: bookingTimeNs,
                  party_size: booking.party_size,
                  ...(hadPaidDeposit && typeof booking.deposit_amount_pence === 'number'
                    ? { deposit_amount_pence: booking.deposit_amount_pence }
                    : {}),
                },
                {
                  venue_id: venueIdNs,
                  booking_id: bookingIdNs,
                  guest_id: guestIdNs,
                },
              );
            } catch (noShowCommsErr) {
              console.error('No-show guest notification failed:', noShowCommsErr);
            }
          });
        }
      } else {
        const statusPayload: Record<string, unknown> = {
          status: newStatus,
          updated_at: new Date().toISOString(),
        };
        // Table bookings: clear "arrived" when seated. Appointment (practitioner) bookings keep client_arrived_at
        // so staff can undo start and return to Confirmed with waiting state restored.
        if (newStatus === 'Seated' && !booking.practitioner_id && !booking.calendar_id) {
          statusPayload.client_arrived_at = null;
        }
        await staff.db.from('bookings').update(statusPayload).eq('id', id);

        if (booking.status === 'Pending' && newStatus === 'Confirmed') {
          const { sendBookingConfirmationNotifications } = await import('@/lib/communications/send-templated');
          const { data: guestRow } = await staff.db.from('guests').select('name, email, phone').eq('id', booking.guest_id).single();
          const { data: venueRow } = await staff.db.from('venues').select('name, address').eq('id', staff.venue_id).single();
          if (guestRow?.email && venueRow?.name) {
            const bookingTime = typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '';
            const emailData = {
              id,
              guest_name: guestRow.name ?? 'Guest',
              guest_email: guestRow.email,
              guest_phone: guestRow.phone ?? null,
              booking_date: booking.booking_date,
              booking_time: bookingTime,
              party_size: booking.party_size,
            };
            const venueEmailData = { name: venueRow.name, address: venueRow.address ?? undefined };
            const vid = staff.venue_id;
            after(async () => {
              try {
                const enriched = await enrichBookingEmailForComms(getSupabaseAdminClient(), id, emailData);
                const { email, sms } = await sendBookingConfirmationNotifications(enriched, venueEmailData, vid);
                if (!email.sent) console.warn('[after] status-confirm email not sent:', email.reason);
                if (!sms.sent && sms.reason !== 'skipped' && sms.reason !== 'no_phone') {
                  console.warn('[after] status-confirm SMS not sent:', sms.reason);
                }
              } catch (err) {
                console.error('[after] status-confirm notifications failed:', err);
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

    /** Appointment bookings: staff marks client as arrived / waiting (optional; cleared when status → Seated). */
    if (body.client_arrived !== undefined) {
      if (!booking.practitioner_id && !booking.calendar_id) {
        return NextResponse.json({ error: 'Arrived is only available for appointment bookings' }, { status: 400 });
      }
      const st = booking.status as string;
      if (!['Pending', 'Confirmed'].includes(st)) {
        return NextResponse.json(
          { error: 'Arrived can only be set when the booking is pending or confirmed' },
          { status: 400 },
        );
      }
      const arrived = Boolean(body.client_arrived);
      await staff.db
        .from('bookings')
        .update({
          client_arrived_at: arrived ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', id)
        .eq('venue_id', staff.venue_id);

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
      const inferredForModify = inferBookingRowModel({
        experience_event_id: booking.experience_event_id as string | null | undefined,
        class_instance_id: booking.class_instance_id as string | null | undefined,
        resource_id: booking.resource_id as string | null | undefined,
        event_session_id: booking.event_session_id as string | null | undefined,
        calendar_id: booking.calendar_id as string | null | undefined,
        service_item_id: booking.service_item_id as string | null | undefined,
        practitioner_id: booking.practitioner_id as string | null | undefined,
        appointment_service_id: booking.appointment_service_id as string | null | undefined,
      });
      if (
        inferredForModify === 'event_ticket' ||
        inferredForModify === 'class_session' ||
        inferredForModify === 'resource_booking'
      ) {
        return NextResponse.json(
          {
            error:
              'Date, time, or party size cannot be changed here for this booking type. Cancel the booking if policy allows and create a new booking.',
          },
          { status: 400 },
        );
      }

      const newDate = (body.booking_date as string) ?? booking.booking_date;
      const newTimeRaw = (body.booking_time as string) ?? (typeof booking.booking_time === 'string' ? booking.booking_time.slice(0, 5) : '12:00');
      const newTime = newTimeRaw.length === 5 ? newTimeRaw + ':00' : newTimeRaw;
      const newPartySize = body.party_size !== undefined ? Number(body.party_size) : booking.party_size;

      if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate) || newPartySize < 1 || newPartySize > 50) {
        return NextResponse.json({ error: 'Invalid date or party size' }, { status: 400 });
      }

      const timeStr = newTime.slice(0, 5);
      const isAppointment = Boolean(booking.practitioner_id || booking.calendar_id);
      const idLc = id.toLowerCase();

      // --- Validate slot availability ---
      if (isAppointment) {
        const practId =
          (body.practitioner_id as string | undefined) ??
          (booking.practitioner_id as string | null) ??
          (booking.calendar_id as string | null);
        const svcId =
          (booking.appointment_service_id as string | null) ?? (booking.service_item_id as string | null);
        const apptInput = await fetchAppointmentInput({
          supabase: admin,
          venueId: staff.venue_id,
          date: newDate,
          practitionerId: practId ?? undefined,
          serviceId: svcId ?? undefined,
        });
        apptInput.existingBookings = apptInput.existingBookings.filter((b) => b.id.toLowerCase() !== idLc);
        apptInput.skipPastSlotFilter = true;
        const { data: venueClock } = await admin
          .from('venues')
          .select('timezone, booking_rules, opening_hours')
          .eq('id', staff.venue_id)
          .single();
        attachVenueClockToAppointmentInput(apptInput, venueClock ?? {});
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
        engineInput.bookings = engineInput.bookings.filter((b) => b.id.toLowerCase() !== idLc);
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
        if (booking.calendar_id) {
          bookingUpdate.calendar_id = body.practitioner_id;
        } else {
          bookingUpdate.practitioner_id = body.practitioner_id;
        }
      }

      const appointmentSvcId = booking.appointment_service_id as string | null | undefined;
      const serviceItemId = booking.service_item_id as string | null | undefined;
      if (isAppointment && (appointmentSvcId || serviceItemId)) {
        let svcDuration = 30;
        if (appointmentSvcId) {
          const { data: svcRow } = await admin
            .from('appointment_services')
            .select('duration_minutes')
            .eq('id', appointmentSvcId)
            .single();
          svcDuration = svcRow?.duration_minutes ?? 30;
        } else if (serviceItemId) {
          const { data: siRow } = await admin
            .from('service_items')
            .select('duration_minutes')
            .eq('id', serviceItemId)
            .single();
          svcDuration = (siRow as { duration_minutes?: number } | null)?.duration_minutes ?? 30;
        }
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

      const prevUpdatedAt = booking.updated_at as string;
      const { data: updatedAfterModify, error: modifyUpdErr } = await staff.db
        .from('bookings')
        .update(bookingUpdate)
        .eq('id', id)
        .eq('updated_at', prevUpdatedAt)
        .select('*')
        .maybeSingle();

      if (modifyUpdErr) {
        console.error('Booking modify update failed:', modifyUpdErr);
        return NextResponse.json({ error: 'Failed to update booking' }, { status: 500 });
      }
      if (!updatedAfterModify) {
        return NextResponse.json(
          { error: 'Booking was modified elsewhere. Refresh and try again.', code: 'stale_booking' },
          { status: 412 },
        );
      }

      await admin.from('events').insert({
        venue_id: staff.venue_id,
        booking_id: id,
        event_type: 'booking_modified',
        payload: { before, after: { booking_date: newDate, booking_time: timeStr, party_size: newPartySize } },
      });

      const dateChanged = newDate !== booking.booking_date;
      const timeChanged = timeStr !== before.booking_time;
      const partySizeChanged = newPartySize !== booking.party_size;

      let tableAssignmentUnassigned = false;
      if (dateChanged || timeChanged || partySizeChanged) {
        const { data: venueForTables } = await admin
          .from('venues')
          .select('table_management_enabled')
          .eq('id', staff.venue_id)
          .single();

        if (venueForTables?.table_management_enabled) {
          await replaceBookingAssignments(admin, id, [], staff.id);
          await clearTableStatusesForBooking(admin, id, staff.id);

          const { durationMinutes, bufferMinutes } = await resolveTableAssignmentDurationBuffer(
            admin,
            staff.venue_id,
            newDate,
            newPartySize,
            booking.service_id,
          );
          const assigned = await autoAssignTable(
            admin,
            staff.venue_id,
            id,
            newDate,
            timeStr,
            durationMinutes,
            bufferMinutes,
            newPartySize,
          );
          if (!assigned) {
            tableAssignmentUnassigned = true;
          }
          const nextAssigned = await getAssignedTableIds(admin, id);
          await syncTableStatusesForBooking(admin, id, nextAssigned, updatedAfterModify.status as string, staff.id);
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
          deposit_amount_pence: updatedAfterModify.deposit_amount_pence ?? null,
          deposit_status: updatedAfterModify.deposit_status ?? null,
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
            const enriched = await enrichBookingEmailForComms(admin, id, bookingEmail);
            await sendBookingModificationNotification(enriched, venueEmail, vid);
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
          .in('message_type', [
            'reminder_56h_email',
            'day_of_reminder_sms',
            'day_of_reminder_email',
            'post_visit_email',
            'reminder_1_email',
            'reminder_1_sms',
            'reminder_2_sms',
            'unified_post_visit_email',
          ]);
      } catch (logResetErr) {
        console.error('Communication log reset failed after modification:', logResetErr);
      }

      return NextResponse.json({
        ...updatedAfterModify,
        ...(tableAssignmentUnassigned ? { table_assignment_unassigned: true as const } : {}),
      });
    }

    return NextResponse.json({ error: 'Provide status or booking_date/booking_time/party_size' }, { status: 400 });
  } catch (err) {
    console.error('PATCH /api/venue/bookings/[id] failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

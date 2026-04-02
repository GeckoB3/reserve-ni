import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import type { BookingEmailData, VenueEmailData, CommMessageType } from '@/lib/emails/types';
import { renderBookingConfirmation } from '@/lib/emails/templates/booking-confirmation';
import { renderDepositRequestSms } from '@/lib/emails/templates/deposit-request-sms';
import { renderDepositRequestEmail } from '@/lib/emails/templates/deposit-request-email';
import { renderDepositConfirmation } from '@/lib/emails/templates/deposit-confirmation';
import { renderReminder56h } from '@/lib/emails/templates/reminder-56h';
import { renderDayOfReminderEmail } from '@/lib/emails/templates/day-of-reminder-email';
import { renderDayOfReminderSms } from '@/lib/emails/templates/day-of-reminder-sms';
import { renderPostVisitEmail } from '@/lib/emails/templates/post-visit';
import { renderBookingModification } from '@/lib/emails/templates/booking-modification';
import { renderBookingCancellation } from '@/lib/emails/templates/booking-cancellation';
import { renderBookingConfirmationSms } from '@/lib/emails/templates/booking-confirmation-sms';

const SAMPLE_BOOKING: BookingEmailData = {
  id: '00000000-0000-0000-0000-000000000000',
  guest_name: 'Sarah Connor',
  guest_email: 'sarah@example.com',
  guest_phone: '+447700900123',
  booking_date: '2026-03-20',
  booking_time: '19:00',
  party_size: 4,
  special_requests: 'Birthday celebration, window table if possible',
  dietary_notes: '1 vegetarian, 1 gluten-free',
  deposit_amount_pence: 2000,
  deposit_status: 'Paid',
  refund_cutoff: '2026-03-18T19:00:00Z',
  manage_booking_link: 'https://www.reserveni.com/m/AAAAAAAAAAAAAAAAAAAAAA.aaaaaaaaaaaa',
  confirm_cancel_link: 'https://www.reserveni.com/c/AAAAAAAAAAAAAAAAAAAAAA.bbbbbbbbbbbb',
};

/** Appointment-style sample for unified scheduling previews (reminders, post-visit, confirmation SMS). */
const SAMPLE_APPOINTMENT_BOOKING: BookingEmailData = {
  ...SAMPLE_BOOKING,
  party_size: 1,
  email_variant: 'appointment',
  guest_name: 'Alex Morgan',
  appointment_service_name: 'Initial consultation',
  practitioner_name: 'Dr. Jordan Smith',
  appointment_price_display: '£45',
  dietary_notes: null,
  special_requests: null,
};

/**
 * POST /api/venue/communication-preview
 * Returns rendered preview of a specific message type with optional custom message.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const messageType = body.messageType as CommMessageType;
    const customMessage = (body.customMessage as string | undefined) ?? null;

    if (!messageType) {
      return NextResponse.json({ error: 'Missing messageType' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data: venue } = await admin
      .from('venues')
      .select('name, address, booking_model')
      .eq('id', staff.venue_id)
      .single();

    const bookingModel = (venue as { booking_model?: string | null } | null)?.booking_model ?? null;
    const useAppointmentSample = isUnifiedSchedulingVenue(bookingModel);

    const venueData: VenueEmailData = {
      name: venue?.name ?? 'Your venue',
      address: venue?.address ?? '123 Main Street, Belfast BT1 1AA',
    };

    const apptBooking = SAMPLE_APPOINTMENT_BOOKING;
    const tableBooking = SAMPLE_BOOKING;
    /** Most previews: match the venue’s booking model so unified/practitioner venues see appointment-style samples. */
    const primarySample = useAppointmentSample ? apptBooking : tableBooking;

    let preview: { subject?: string; html?: string; text?: string; body?: string } = {};

    switch (messageType) {
      case 'booking_confirmation_email':
        preview = renderBookingConfirmation(primarySample, venueData, customMessage);
        break;
      case 'deposit_request_sms':
        preview = renderDepositRequestSms(
          primarySample,
          venueData,
          'https://www.reserveni.com/pay?t=preview',
          customMessage,
        );
        break;
      case 'deposit_request_email':
        preview = renderDepositRequestEmail(
          primarySample,
          venueData,
          'https://www.reserveni.com/pay?t=preview',
          customMessage,
        );
        break;
      case 'deposit_confirmation_email':
        preview = renderDepositConfirmation(primarySample, venueData, customMessage);
        break;
      case 'reminder_56h_email':
        preview = renderReminder56h(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'reminder_1_email':
        preview = renderReminder56h(apptBooking, venueData, customMessage);
        break;
      case 'reminder_1_sms':
      case 'reminder_2_sms':
        preview = renderDayOfReminderSms(apptBooking, venueData, customMessage);
        break;
      case 'unified_post_visit_email':
        preview = renderPostVisitEmail(apptBooking, venueData, customMessage);
        break;
      case 'booking_confirmation_sms':
        preview = renderBookingConfirmationSms(apptBooking, venueData, customMessage);
        break;
      case 'day_of_reminder_email':
        preview = renderDayOfReminderEmail(
          useAppointmentSample ? apptBooking : tableBooking,
          venueData,
          customMessage,
        );
        break;
      case 'day_of_reminder_sms':
        preview = renderDayOfReminderSms(
          useAppointmentSample ? apptBooking : tableBooking,
          venueData,
          customMessage,
        );
        break;
      case 'post_visit_email':
        preview = renderPostVisitEmail(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'booking_modification_email':
        preview = renderBookingModification(primarySample, venueData, customMessage);
        break;
      case 'cancellation_email':
        preview = renderBookingCancellation(
          primarySample,
          venueData,
          'Your deposit of £20.00 will be refunded to your original payment method within 5–10 business days.',
          customMessage,
        );
        break;
      default:
        return NextResponse.json({ error: 'Unknown message type' }, { status: 400 });
    }

    return NextResponse.json({
      messageType,
      subject: preview.subject ?? null,
      html: preview.html ?? null,
      text: preview.text ?? preview.body ?? null,
    });
  } catch (err) {
    console.error('Preview render failed:', err);
    return NextResponse.json({ error: 'Render failed' }, { status: 500 });
  }
}

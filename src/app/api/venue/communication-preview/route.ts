import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
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
  manage_booking_link: 'https://www.reserveni.com/manage/preview',
  confirm_cancel_link: 'https://www.reserveni.com/confirm/preview?hmac=sample',
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
      .select('name, address')
      .eq('id', staff.venue_id)
      .single();

    const venueData: VenueEmailData = {
      name: venue?.name ?? 'Your Restaurant',
      address: venue?.address ?? '123 Main Street, Belfast BT1 1AA',
    };

    let preview: { subject?: string; html?: string; text?: string; body?: string } = {};

    switch (messageType) {
      case 'booking_confirmation_email':
        preview = renderBookingConfirmation(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'deposit_request_sms':
        preview = renderDepositRequestSms(SAMPLE_BOOKING, venueData, 'https://www.reserveni.com/pay?t=preview', customMessage);
        break;
      case 'deposit_request_email':
        preview = renderDepositRequestEmail(SAMPLE_BOOKING, venueData, 'https://www.reserveni.com/pay?t=preview', customMessage);
        break;
      case 'deposit_confirmation_email':
        preview = renderDepositConfirmation(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'reminder_56h_email':
        preview = renderReminder56h(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'day_of_reminder_email':
        preview = renderDayOfReminderEmail(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'day_of_reminder_sms':
        preview = renderDayOfReminderSms(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'post_visit_email':
        preview = renderPostVisitEmail(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'booking_modification_email':
        preview = renderBookingModification(SAMPLE_BOOKING, venueData, customMessage);
        break;
      case 'cancellation_email':
        preview = renderBookingCancellation(SAMPLE_BOOKING, venueData, 'Your deposit of £20.00 will be refunded to your original payment method within 5–10 business days.', customMessage);
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

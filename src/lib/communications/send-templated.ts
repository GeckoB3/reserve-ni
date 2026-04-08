import type { BookingEmailData, VenueEmailData } from '@/lib/emails/types';
import { sendPolicyMessage } from './outbound';

interface SendResult {
  sent: boolean;
  reason?: string;
}

export async function sendBookingConfirmationEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
): Promise<SendResult> {
  return sendPolicyMessage({
    venueId,
    booking,
    venue,
    messageKey: 'booking_confirmation',
    channel: 'email',
    mode: 'dedupe',
  });
}

/**
 * Booking confirmation SMS — routed by `communication_policies` (lane + channels).
 * Default is email-only; venues enable SMS per lane under Communications settings.
 */
export async function sendBookingConfirmationSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  guestPhone?: string | null,
): Promise<SendResult> {
  return sendPolicyMessage({
    venueId,
    booking: {
      ...booking,
      guest_phone: guestPhone ?? booking.guest_phone ?? null,
    },
    venue,
    messageKey: 'booking_confirmation',
    channel: 'sms',
    mode: 'dedupe',
  });
}

export async function sendBookingConfirmationNotifications(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
): Promise<{ email: SendResult; sms: SendResult }> {
  const email = await sendBookingConfirmationEmail(booking, venue, venueId);
  const sms = await sendBookingConfirmationSms(booking, venue, venueId);
  return { email, sms };
}

export async function sendDepositRequestEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  paymentLink: string,
): Promise<SendResult> {
  return sendPolicyMessage({
    venueId,
    booking,
    venue,
    messageKey: 'deposit_payment_request',
    channel: 'email',
    mode: 'dedupe',
    paymentLink,
    paymentDeadlineHours: 24,
  });
}

/**
 * Staff / pay-by-link flows only: send deposit request email and/or SMS per settings and tier.
 */
export async function sendDepositRequestNotifications(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  paymentLink: string,
): Promise<{ email: SendResult; sms: SendResult }> {
  const email = await sendDepositRequestEmail(booking, venue, venueId, paymentLink);
  let sms: SendResult = { sent: false, reason: 'no_phone' };
  if (booking.guest_phone) {
    sms = await sendDepositRequestSms(booking, venue, venueId, paymentLink, booking.guest_phone);
  }
  return { email, sms };
}

export async function sendDepositRequestSms(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  paymentLink: string,
  guestPhone: string,
): Promise<SendResult> {
  return sendPolicyMessage({
    venueId,
    booking: {
      ...booking,
      guest_phone: guestPhone,
    },
    venue,
    messageKey: 'deposit_payment_request',
    channel: 'sms',
    mode: 'dedupe',
    paymentLink,
    paymentDeadlineHours: 24,
  });
}

export async function sendDepositConfirmationEmail(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
): Promise<SendResult> {
  return sendPolicyMessage({
    venueId,
    booking,
    venue,
    messageKey: 'deposit_confirmation',
    channel: 'email',
    mode: 'dedupe',
  });
}

/**
 * Send booking modification notification email and/or SMS based on venue settings.
 * No dedup - the same booking can be modified multiple times.
 */
export async function sendBookingModificationNotification(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
): Promise<{ email: SendResult; sms: SendResult }> {
  const [email, sms] = await Promise.all([
    sendPolicyMessage({
      venueId,
      booking,
      venue,
      messageKey: 'booking_modification',
      channel: 'email',
      mode: 'upsert',
    }),
    sendPolicyMessage({
      venueId,
      booking,
      venue,
      messageKey: 'booking_modification',
      channel: 'sms',
      mode: 'upsert',
    }),
  ]);
  return { email, sms };
}

/**
 * Send booking cancellation notification email and/or SMS based on venue settings.
 * A booking can only be cancelled once, so trySendWithDedup would work, but we
 * use upsert for consistency with the modification pattern.
 */
export async function sendCancellationNotification(
  booking: BookingEmailData,
  venue: VenueEmailData,
  venueId: string,
  refundMessage?: string | null,
): Promise<{ email: SendResult; sms: SendResult }> {
  const [email, sms] = await Promise.all([
    sendPolicyMessage({
      venueId,
      booking,
      venue,
      messageKey: 'cancellation_confirmation',
      channel: 'email',
      mode: 'upsert',
      refundMessage: refundMessage ?? null,
      rebookLink: venue.booking_page_url ?? null,
    }),
    sendPolicyMessage({
      venueId,
      booking,
      venue,
      messageKey: 'cancellation_confirmation',
      channel: 'sms',
      mode: 'upsert',
      refundMessage: refundMessage ?? null,
      rebookLink: venue.booking_page_url ?? null,
    }),
  ]);
  return { email, sms };
}

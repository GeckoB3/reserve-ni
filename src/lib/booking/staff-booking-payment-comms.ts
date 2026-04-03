import type { SupabaseClient } from '@supabase/supabase-js';
import type { NextRequest } from 'next/server';
import { after } from 'next/server';
import { stripe } from '@/lib/stripe';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import { createPaymentPageUrl } from '@/lib/payment-token';
import { createShortManageLink } from '@/lib/short-manage-link';
import { sendBookingConfirmationNotifications, sendDepositRequestNotifications } from '@/lib/communications/send-templated';
import type { BookingModel } from '@/types/booking-models';

export type StaffBookingEmailExtras = {
  email_variant?: 'appointment';
  booking_model?: BookingModel;
  appointment_service_name?: string | null;
  practitioner_name?: string | null;
  appointment_price_display?: string | null;
};

/**
 * After inserting a staff-created non-table booking: optional PI + deposit request, else confirm comms.
 * On Stripe failure, throws so the caller can roll back the booking insert.
 */
export async function applyStaffBookingPaymentAndComms(params: {
  admin: SupabaseClient;
  request: NextRequest;
  venueId: string;
  venueName: string;
  venueAddress: string | undefined;
  stripeConnectedAccountId: string | null;
  bookingId: string;
  guestName: string;
  guestEmail: string | null;
  guestPhone: string | null;
  booking_date: string;
  booking_time: string;
  party_size: number;
  special_requests: string | null;
  dietary_notes: string | null;
  requiresDeposit: boolean;
  depositAmountPence: number;
  emailExtras: StaffBookingEmailExtras;
  logContext: string;
}): Promise<{ payment_url?: string }> {
  const {
    admin,
    request,
    venueId,
    venueName,
    venueAddress,
    stripeConnectedAccountId,
    bookingId,
    guestName,
    guestEmail,
    guestPhone,
    booking_date,
    booking_time,
    party_size,
    special_requests,
    dietary_notes,
    requiresDeposit,
    depositAmountPence,
    emailExtras,
    logContext,
  } = params;

  let payment_url: string | undefined;
  if (requiresDeposit && depositAmountPence > 0 && stripeConnectedAccountId) {
    try {
      const paymentIntent = await stripe.paymentIntents.create(
        {
          amount: depositAmountPence,
          currency: 'gbp',
          metadata: { booking_id: bookingId, venue_id: venueId },
          automatic_payment_methods: { enabled: true },
        },
        { stripeAccount: stripeConnectedAccountId },
      );
      await admin
        .from('bookings')
        .update({ stripe_payment_intent_id: paymentIntent.id, updated_at: new Date().toISOString() })
        .eq('id', bookingId);

      const baseUrl =
        process.env.NEXT_PUBLIC_BASE_URL ||
        (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
      payment_url = createPaymentPageUrl(bookingId, baseUrl);
    } catch (stripeErr) {
      console.error(`PaymentIntent create failed (${logContext}):`, stripeErr);
      throw new Error('payment_failed');
    }

    const depositPayload = {
      id: bookingId,
      guest_name: guestName,
      guest_email: guestEmail,
      guest_phone: guestPhone,
      booking_date,
      booking_time,
      party_size,
      special_requests,
      dietary_notes,
      deposit_amount_pence: depositAmountPence,
    };
    after(async () => {
      try {
        const results = await sendDepositRequestNotifications(
          depositPayload,
          { name: venueName, address: venueAddress },
          venueId,
          payment_url!,
        );
        if (!results.email.sent && !results.sms.sent) {
          console.warn(`[after] ${logContext} deposit notifications not sent:`, {
            email: results.email.reason,
            sms: results.sms.reason,
          });
        }
      } catch (err) {
        console.error(`[after] ${logContext} deposit notifications failed:`, err);
      }
    });
  } else {
    const manageToken = generateConfirmToken();
    await admin
      .from('bookings')
      .update({ confirm_token_hash: hashConfirmToken(manageToken), updated_at: new Date().toISOString() })
      .eq('id', bookingId);

    const manageBookingLink = createShortManageLink(bookingId);

    if (guestEmail || guestPhone) {
      after(async () => {
        try {
          const { email, sms } = await sendBookingConfirmationNotifications(
            {
              id: bookingId,
              guest_name: guestName,
              guest_email: guestEmail,
              guest_phone: guestPhone,
              booking_date,
              booking_time,
              party_size,
              special_requests,
              dietary_notes,
              manage_booking_link: manageBookingLink,
              ...emailExtras,
            },
            { name: venueName, address: venueAddress },
            venueId,
          );
          if (!email.sent) console.warn(`[after] ${logContext} confirmation email not sent:`, email.reason);
          if (!sms.sent && sms.reason !== 'skipped' && sms.reason !== 'no_phone') {
            console.warn(`[after] ${logContext} confirmation SMS not sent:`, sms.reason);
          }
        } catch (err) {
          console.error(`[after] ${logContext} confirmation notifications failed:`, err);
        }
      });
    }
  }

  return { payment_url };
}

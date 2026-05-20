import type { SupabaseClient } from '@supabase/supabase-js';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';
import {
  sendBookingConfirmationNotifications,
  sendDepositConfirmationEmail,
} from '@/lib/communications/send-templated';
import { enrichBookingEmailForComms } from '@/lib/emails/booking-email-enrichment';
import { createOrGetBookingShortLink } from '@/lib/booking-short-links';
import { isSelfServeBookingSource } from '@/lib/booking-source';
import { formatGuestDisplayName } from '@/lib/guests/name';
import type { VenueEmailData } from '@/lib/emails/types';

export type ConfirmDepositPaymentResult =
  | { ok: true; confirmedIds: string[]; alreadyConfirmed: boolean }
  | { ok: false; reason: string };

/**
 * Marks every Pending booking row sharing a succeeded PaymentIntent as Booked / Paid
 * and assigns manage-booking tokens when missing.
 */
export async function confirmBookingsForSucceededPaymentIntent(
  admin: SupabaseClient,
  params: {
    paymentIntentId: string;
    venueId: string;
    guestEmail?: string | null;
  },
): Promise<ConfirmDepositPaymentResult> {
  const { paymentIntentId, venueId, guestEmail } = params;

  const { data: updatedRows, error: updateErr } = await admin
    .from('bookings')
    .update({
      status: 'Booked',
      deposit_status: 'Paid',
      updated_at: new Date().toISOString(),
    })
    .eq('stripe_payment_intent_id', paymentIntentId)
    .eq('venue_id', venueId)
    .eq('status', 'Pending')
    .select('id');

  if (updateErr) {
    console.error('[confirmBookingsForSucceededPaymentIntent] booking update failed:', updateErr, {
      paymentIntentId,
      venueId,
    });
    return { ok: false, reason: 'booking_update_failed' };
  }

  if (!updatedRows?.length) {
    return { ok: true, confirmedIds: [], alreadyConfirmed: true };
  }

  const confirmedIds = updatedRows.map((r) => r.id).filter(Boolean) as string[];

  if (guestEmail) {
    const { error: emailErr } = await admin
      .from('bookings')
      .update({ guest_email: guestEmail, updated_at: new Date().toISOString() })
      .in('id', confirmedIds);
    if (emailErr) {
      console.error('[confirmBookingsForSucceededPaymentIntent] guest_email update failed:', emailErr, {
        paymentIntentId,
        venueId,
      });
      return { ok: false, reason: 'guest_email_update_failed' };
    }
  }

  for (const bid of confirmedIds) {
    const candidateToken = generateConfirmToken();
    const { error: tokenErr } = await admin
      .from('bookings')
      .update({
        confirm_token_hash: hashConfirmToken(candidateToken),
        updated_at: new Date().toISOString(),
      })
      .eq('id', bid)
      .is('confirm_token_hash', null);
    if (tokenErr) {
      console.error('[confirmBookingsForSucceededPaymentIntent] confirm token update failed:', tokenErr, {
        bookingId: bid,
        paymentIntentId,
      });
      return { ok: false, reason: 'confirm_token_update_failed' };
    }
  }

  return { ok: true, confirmedIds, alreadyConfirmed: false };
}

export async function sendDepositPaidBookingComms(
  admin: SupabaseClient,
  params: {
    confirmedIds: string[];
    venueId: string;
    venueData: VenueEmailData;
    guest?: {
      first_name?: string | null;
      last_name?: string | null;
      email?: string | null;
      phone?: string | null;
    } | null;
    guestEmail?: string | null;
  },
): Promise<void> {
  const { confirmedIds, venueId, venueData, guest, guestEmail } = params;
  const recipientEmail = guestEmail ?? guest?.email ?? null;

  for (const bid of confirmedIds) {
    const { data: b } = await admin
      .from('bookings')
      .select(
        'booking_model, booking_date, booking_time, party_size, deposit_amount_pence, guest_email, source, cancellation_deadline',
      )
      .eq('id', bid)
      .maybeSingle();
    if (!b) continue;

    const manageBookingLink = await createOrGetBookingShortLink({
      venueId,
      bookingId: bid,
      purpose: 'manage',
    });
    const rowEmail = (b as { guest_email?: string | null }).guest_email ?? recipientEmail;
    const guestDisplay = formatGuestDisplayName(guest?.first_name, guest?.last_name);
    const bookingData = {
      id: bid,
      guest_name: guestDisplay !== 'Guest' ? guestDisplay : (rowEmail ?? 'Guest'),
      guest_email: rowEmail ?? null,
      guest_phone: guest?.phone ?? null,
      booking_date: b.booking_date ?? '',
      booking_time: typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : b.booking_time ?? '',
      party_size: b.party_size ?? 2,
      deposit_amount_pence: b.deposit_amount_pence ?? null,
      deposit_status: 'Paid' as const,
      manage_booking_link: manageBookingLink,
      booking_model: b.booking_model,
      refund_cutoff: (b as { cancellation_deadline?: string | null }).cancellation_deadline ?? null,
    };

    const hasDeposit = Boolean(rowEmail && b.deposit_amount_pence);
    const skipDepositReceipt = isSelfServeBookingSource(b.source as string | null);

    try {
      const enriched = await enrichBookingEmailForComms(admin, bid, bookingData);
      const { email: confEmail, sms: confSms } = await sendBookingConfirmationNotifications(
        enriched,
        venueData,
        venueId,
      );
      if (!confEmail.sent) console.warn('[deposit-paid comms] confirmation email not sent:', confEmail.reason);
      if (!confSms.sent && confSms.reason !== 'skipped' && confSms.reason !== 'no_phone') {
        console.warn('[deposit-paid comms] confirmation SMS not sent:', confSms.reason);
      }
    } catch (err) {
      console.error('[deposit-paid comms] confirmation notifications failed:', err, { bookingId: bid });
    }

    if (hasDeposit && !skipDepositReceipt) {
      try {
        const enrichedDep = await enrichBookingEmailForComms(admin, bid, bookingData);
        const depResult = await sendDepositConfirmationEmail(enrichedDep, venueData, venueId);
        if (!depResult.sent) console.warn('[deposit-paid comms] deposit email not sent:', depResult.reason);
      } catch (err) {
        console.error('[deposit-paid comms] deposit email failed:', err, { bookingId: bid });
      }
    }
  }
}

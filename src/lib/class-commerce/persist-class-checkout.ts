import type { SupabaseClient } from '@supabase/supabase-js';
import { RESERVE_NI_PI_PURPOSE } from '@/types/class-commerce';

/**
 * Persists audit rows for a class multi-session cart PaymentIntent (idempotent on PI id).
 */
export async function persistClassCartCheckoutTransaction(
  admin: SupabaseClient,
  params: {
    venueId: string;
    userId: string;
    groupBookingId: string;
    paymentIntentId: string;
    amountPence: number;
    paidBookingIds: string[];
  },
): Promise<void> {
  const { venueId, userId, groupBookingId, paymentIntentId, amountPence, paidBookingIds } = params;

  const { data: txn, error: insErr } = await admin
    .from('class_checkout_transactions')
    .insert({
      venue_id: venueId,
      user_id: userId,
      group_booking_id: groupBookingId,
      stripe_payment_intent_id: paymentIntentId,
      purpose: RESERVE_NI_PI_PURPOSE.CLASS_CART_CHECKOUT,
      amount_pence: amountPence,
      currency: 'gbp',
      metadata: { paid_booking_ids: paidBookingIds },
    })
    .select('id')
    .maybeSingle();

  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      return;
    }
    console.error('[persistClassCartCheckoutTransaction] insert transaction', insErr);
    return;
  }

  if (!txn?.id) return;

  const { data: rows, error: bookErr } = await admin
    .from('bookings')
    .select('id, deposit_amount_pence')
    .in('id', paidBookingIds);

  if (bookErr) {
    console.error('[persistClassCartCheckoutTransaction] load bookings', bookErr);
    return;
  }

  const allocations = (rows ?? []).map((r) => {
    const row = r as { id: string; deposit_amount_pence: number | null };
    return {
      checkout_transaction_id: txn.id,
      booking_id: row.id,
      amount_pence: row.deposit_amount_pence ?? 0,
    };
  });

  if (allocations.length === 0) return;

  const { error: allocErr } = await admin.from('class_payment_allocations').insert(allocations);
  if (allocErr) {
    console.error('[persistClassCartCheckoutTransaction] insert allocations', allocErr);
  }
}

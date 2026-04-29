import type { SupabaseClient } from '@supabase/supabase-js';
import { creditsProductEligibleForClassType } from '@/lib/class-commerce/available-class-credits';

export interface ConsumeClassCreditsParams {
  admin: SupabaseClient;
  userId: string;
  venueId: string;
  credits: number;
  bookingId: string;
  idempotencyKey: string;
  /** When set, only balances from packs that apply to this class type are consumed. */
  classTypeId?: string;
}

/**
 * FIFO by expires_at (NULL last), then created_at. Idempotent via ledger idempotency_key per batch.
 * For strict race safety under concurrent bookings, prefer a DB RPC with `SELECT … FOR UPDATE`
 * on balance rows (future hardening).
 */
export async function consumeClassCreditsForBooking(
  params: ConsumeClassCreditsParams,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const { admin, userId, venueId, credits, bookingId, idempotencyKey, classTypeId } = params;
  if (credits <= 0) return { ok: false, reason: 'invalid_amount' };

  const { data: existingRedeem } = await admin
    .from('class_credit_ledger')
    .select('id')
    .eq('booking_id', bookingId)
    .eq('reason', 'redeem')
    .limit(1)
    .maybeSingle();
  if (existingRedeem) return { ok: true };

  const { data: batches, error: selErr } = await admin
    .from('user_class_credit_balances')
    .select('id, credits_remaining, expires_at, created_at, product_id')
    .eq('user_id', userId)
    .eq('venue_id', venueId)
    .gt('credits_remaining', 0)
    .order('expires_at', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });

  if (selErr) {
    console.error('[consumeClassCreditsForBooking] select batches', selErr);
    return { ok: false, reason: 'db_error' };
  }

  let rows = (batches ?? []) as Array<{
    id: string;
    credits_remaining: number;
    product_id: string;
  }>;

  if (classTypeId) {
    const productIds = [...new Set(rows.map((r) => r.product_id))];
    const { data: products, error: pErr } = await admin
      .from('class_credit_products')
      .select('id, eligible_class_type_ids')
      .in('id', productIds);

    if (pErr) {
      console.error('[consumeClassCreditsForBooking] products', pErr);
      return { ok: false, reason: 'db_error' };
    }

    const eligibleByProduct = new Map(
      (products ?? []).map((p) => {
        const row = p as { id: string; eligible_class_type_ids: string[] | null };
        return [row.id, row.eligible_class_type_ids] as const;
      }),
    );

    rows = rows.filter((b) =>
      creditsProductEligibleForClassType(eligibleByProduct.get(b.product_id) ?? null, classTypeId),
    );
  }

  let remaining = credits;
  let totalAvailable = 0;
  for (const r of rows) totalAvailable += r.credits_remaining;
  if (totalAvailable < remaining) {
    return { ok: false, reason: 'insufficient_credits' };
  }

  for (const batch of rows) {
    if (remaining <= 0) break;
    const take = Math.min(batch.credits_remaining, remaining);
    const newRem = batch.credits_remaining - take;
    const { error: upErr } = await admin
      .from('user_class_credit_balances')
      .update({ credits_remaining: newRem, updated_at: new Date().toISOString() })
      .eq('id', batch.id);
    if (upErr) {
      console.error('[consumeClassCreditsForBooking] update batch', upErr);
      return { ok: false, reason: 'db_error' };
    }
    const { error: ledErr } = await admin.from('class_credit_ledger').insert({
      balance_id: batch.id,
      user_id: userId,
      venue_id: venueId,
      delta_credits: -take,
      reason: 'redeem',
      booking_id: bookingId,
      idempotency_key: `${idempotencyKey}:${batch.id}`,
      note: 'Redeemed for class booking',
    });
    if (ledErr) {
      console.error('[consumeClassCreditsForBooking] ledger', ledErr);
      return { ok: false, reason: 'ledger_failed' };
    }
    remaining -= take;
  }

  return { ok: true };
}

import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Reverses `redeem` ledger rows for a booking (e.g. eligible cancellation) by restoring batch balances
 * and appending balancing `refund` ledger rows. Idempotent per source ledger row via idempotency_key.
 */
export async function restoreClassCreditsForBooking(
  admin: SupabaseClient,
  params: { bookingId: string; idempotencyPrefix: string },
): Promise<{ ok: true; restoredCredits: number } | { ok: false; reason: string }> {
  const { bookingId, idempotencyPrefix } = params;

  const { data: redeems, error: selErr } = await admin
    .from('class_credit_ledger')
    .select('id, balance_id, user_id, venue_id, delta_credits')
    .eq('booking_id', bookingId)
    .eq('reason', 'redeem');

  if (selErr) {
    console.error('[restoreClassCreditsForBooking] select', selErr);
    return { ok: false, reason: 'db_error' };
  }

  const rows = (redeems ?? []) as Array<{
    id: string;
    balance_id: string | null;
    user_id: string;
    venue_id: string;
    delta_credits: number;
  }>;

  if (rows.length === 0) return { ok: true, restoredCredits: 0 };

  let restored = 0;

  for (const row of rows) {
    const take = -row.delta_credits;
    if (take <= 0 || !row.balance_id) continue;

    const idempotencyKey = `${idempotencyPrefix}:restore:${row.id}`;
    const { data: existing } = await admin
      .from('class_credit_ledger')
      .select('id')
      .eq('idempotency_key', idempotencyKey)
      .maybeSingle();
    if (existing) continue;

    const { data: batch, error: bErr } = await admin
      .from('user_class_credit_balances')
      .select('id, credits_remaining')
      .eq('id', row.balance_id)
      .maybeSingle();

    if (bErr || !batch) {
      console.error('[restoreClassCreditsForBooking] batch missing', bErr);
      return { ok: false, reason: 'batch_missing' };
    }

    const b = batch as { id: string; credits_remaining: number };
    const newRem = b.credits_remaining + take;

    const { error: upErr } = await admin
      .from('user_class_credit_balances')
      .update({ credits_remaining: newRem, updated_at: new Date().toISOString() })
      .eq('id', b.id);

    if (upErr) {
      console.error('[restoreClassCreditsForBooking] update batch', upErr);
      return { ok: false, reason: 'db_error' };
    }

    const { error: ledErr } = await admin.from('class_credit_ledger').insert({
      balance_id: b.id,
      user_id: row.user_id,
      venue_id: row.venue_id,
      delta_credits: take,
      reason: 'refund',
      booking_id: bookingId,
      idempotency_key: idempotencyKey,
      note: 'Restored credits after booking release',
    });

    if (ledErr) {
      console.error('[restoreClassCreditsForBooking] ledger', ledErr);
      return { ok: false, reason: 'ledger_failed' };
    }

    restored += take;
  }

  return { ok: true, restoredCredits: restored };
}

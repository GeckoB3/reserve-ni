import type { SupabaseClient } from '@supabase/supabase-js';

/** True if a credit product applies to this class type. */
export function creditsProductEligibleForClassType(
  eligibleClassTypeIds: string[] | null | undefined,
  classTypeId: string,
): boolean {
  if (eligibleClassTypeIds == null || eligibleClassTypeIds.length === 0) return true;
  return eligibleClassTypeIds.includes(classTypeId);
}

/**
 * Credits from packs whose `eligible_class_type_ids` is null/empty (all classes) or includes `classTypeId`.
 * Excludes batches that are fully expired (`expires_at` in the past).
 */
export async function sumAvailableClassCreditsForClassType(
  admin: SupabaseClient,
  params: { userId: string; venueId: string; classTypeId: string },
): Promise<number> {
  const { userId, venueId, classTypeId } = params;
  const nowIso = new Date().toISOString();

  const { data: batches, error } = await admin
    .from('user_class_credit_balances')
    .select('credits_remaining, product_id, expires_at')
    .eq('user_id', userId)
    .eq('venue_id', venueId)
    .gt('credits_remaining', 0);

  if (error) {
    console.error('[sumAvailableClassCreditsForClassType] select', error);
    return 0;
  }

  const rows = (batches ?? []) as Array<{
    credits_remaining: number;
    product_id: string;
    expires_at: string | null;
  }>;

  const active = rows.filter((r) => !r.expires_at || r.expires_at > nowIso);
  if (active.length === 0) return 0;

  const productIds = [...new Set(active.map((r) => r.product_id))];
  const { data: products, error: pErr } = await admin
    .from('class_credit_products')
    .select('id, eligible_class_type_ids')
    .in('id', productIds);

  if (pErr) {
    console.error('[sumAvailableClassCreditsForClassType] products', pErr);
    return 0;
  }

  const productMap = new Map(
    (products ?? []).map((p) => {
      const row = p as { id: string; eligible_class_type_ids: string[] | null };
      return [row.id, row.eligible_class_type_ids] as const;
    }),
  );

  let sum = 0;
  for (const b of active) {
    const eligible = productMap.get(b.product_id);
    if (creditsProductEligibleForClassType(eligible ?? null, classTypeId)) {
      sum += b.credits_remaining;
    }
  }
  return sum;
}

import type { SupabaseClient } from '@supabase/supabase-js';
import { creditsProductEligibleForClassType } from '@/lib/class-commerce/available-class-credits';
import { parseMembershipRules } from '@/lib/class-commerce/product-schemas';

/**
 * True if the user has an active/trialing membership whose rules grant unlimited access
 * to this class type (eligible list empty means all types).
 */
export async function membershipUnlimitedCoversClassType(
  admin: SupabaseClient,
  params: { userId: string; venueId: string; classTypeId: string },
): Promise<boolean> {
  const { userId, venueId, classTypeId } = params;

  const { data: memberships, error: mErr } = await admin
    .from('class_memberships')
    .select('product_id')
    .eq('user_id', userId)
    .eq('venue_id', venueId)
    .in('status', ['active', 'trialing']);

  if (mErr) {
    console.error('[membershipUnlimitedCoversClassType] memberships', mErr);
    return false;
  }

  const productIds = [...new Set((memberships ?? []).map((r) => (r as { product_id: string }).product_id))];
  if (productIds.length === 0) return false;

  const { data: products, error: pErr } = await admin
    .from('class_membership_products')
    .select('id, rules, active')
    .in('id', productIds)
    .eq('active', true);

  if (pErr) {
    console.error('[membershipUnlimitedCoversClassType] products', pErr);
    return false;
  }

  for (const p of products ?? []) {
    const row = p as { rules: Record<string, unknown> };
    const rules = parseMembershipRules(row.rules);
    if (!rules.unlimited) continue;
    if (!creditsProductEligibleForClassType(rules.eligible_class_type_ids ?? null, classTypeId)) continue;
    return true;
  }
  return false;
}

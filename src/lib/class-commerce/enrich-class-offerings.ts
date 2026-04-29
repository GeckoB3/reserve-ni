import type { SupabaseClient } from '@supabase/supabase-js';

export interface ClassOfferingCommerceCatalog {
  credit_products: Array<{
    id: string;
    name: string;
    credits_count: number;
    price_pence: number;
    currency: string;
    eligible_class_type_ids: string[] | null;
  }>;
  course_products: Array<{
    id: string;
    name: string;
    price_pence: number;
    currency: string;
    session_count: number;
  }>;
  membership_products: Array<{
    id: string;
    name: string;
    currency: string;
  }>;
  /** When a signed-in user is resolved, total remaining credits for this venue (all products). */
  viewer_credits_remaining: number | null;
  /** Heuristic: cheapest active pack by `price_pence` (MVP suggestion). */
  suggested_credit_product_id: string | null;
}

/**
 * Loads bookable-adjacent commerce catalog for public class offerings (no prices on instances themselves).
 */
export async function loadClassOfferingCommerceCatalog(
  admin: SupabaseClient,
  params: { venueId: string; viewerUserId?: string | null },
): Promise<ClassOfferingCommerceCatalog> {
  const { venueId, viewerUserId } = params;

  const [{ data: creditRows }, { data: courseRows }, { data: memRows }] = await Promise.all([
    admin
      .from('class_credit_products')
      .select('id, name, credits_count, price_pence, currency, eligible_class_type_ids')
      .eq('venue_id', venueId)
      .eq('active', true)
      .order('price_pence', { ascending: true }),
    admin
      .from('class_course_products')
      .select('id, name, price_pence, currency, session_instance_ids')
      .eq('venue_id', venueId)
      .eq('active', true)
      .order('name', { ascending: true }),
    admin
      .from('class_membership_products')
      .select('id, name, currency')
      .eq('venue_id', venueId)
      .eq('active', true)
      .order('name', { ascending: true }),
  ]);

  const credit_products = (creditRows ?? []).map((r) => {
    const row = r as {
      id: string;
      name: string;
      credits_count: number;
      price_pence: number;
      currency: string;
      eligible_class_type_ids: string[] | null;
    };
    return {
      id: row.id,
      name: row.name,
      credits_count: row.credits_count,
      price_pence: row.price_pence,
      currency: row.currency,
      eligible_class_type_ids: row.eligible_class_type_ids,
    };
  });

  const course_products = (courseRows ?? []).map((r) => {
    const row = r as {
      id: string;
      name: string;
      price_pence: number;
      currency: string;
      session_instance_ids: string[] | null;
    };
    const ids = row.session_instance_ids ?? [];
    return {
      id: row.id,
      name: row.name,
      price_pence: row.price_pence,
      currency: row.currency,
      session_count: ids.length,
    };
  });

  const membership_products = (memRows ?? []).map((r) => {
    const row = r as { id: string; name: string; currency: string };
    return { id: row.id, name: row.name, currency: row.currency };
  });

  let viewer_credits_remaining: number | null = null;
  if (viewerUserId) {
    const { data: bal, error } = await admin
      .from('user_class_credit_balances')
      .select('credits_remaining')
      .eq('user_id', viewerUserId)
      .eq('venue_id', venueId)
      .gt('credits_remaining', 0);
    if (!error && bal?.length) {
      viewer_credits_remaining = bal.reduce((s, b) => s + (b as { credits_remaining: number }).credits_remaining, 0);
    } else {
      viewer_credits_remaining = 0;
    }
  }

  const suggested_credit_product_id = credit_products[0]?.id ?? null;

  return {
    credit_products,
    course_products,
    membership_products,
    viewer_credits_remaining,
    suggested_credit_product_id,
  };
}

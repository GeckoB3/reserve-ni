import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';

/**
 * GET /api/platform/summary
 *
 * Returns aggregate KPI counts for the superuser overview panel.
 * Middleware enforces superuser access before this handler runs.
 */
export async function GET() {
  const admin = getSupabaseAdminClient();

  const [venuesResult, staffResult] = await Promise.all([
    admin.from('venues').select('id, pricing_tier, plan_status', { count: 'exact' }),
    admin.from('staff').select('id', { count: 'exact' }),
  ]);

  if (venuesResult.error || staffResult.error) {
    console.error('[platform/summary] error:', venuesResult.error ?? staffResult.error);
    return NextResponse.json({ error: 'Failed to load summary' }, { status: 500 });
  }

  const venues = venuesResult.data ?? [];

  const totalVenues = venuesResult.count ?? 0;
  const totalStaff = staffResult.count ?? 0;

  let activeVenues = 0;
  let appointmentsCount = 0;
  let restaurantCount = 0;
  let foundingCount = 0;

  for (const v of venues) {
    const tier = (v.pricing_tier as string)?.toLowerCase().trim() ?? '';
    const planStatus = (v.plan_status as string)?.toLowerCase().trim() ?? '';

    if (planStatus === 'active' || planStatus === 'trialing') activeVenues++;
    if (tier === 'appointments') appointmentsCount++;
    else if (tier === 'restaurant') restaurantCount++;
    else if (tier === 'founding') foundingCount++;
  }

  return NextResponse.json({
    totalVenues,
    activeVenues,
    totalStaff,
    byTier: {
      appointments: appointmentsCount,
      restaurant: restaurantCount,
      founding: foundingCount,
    },
  });
}

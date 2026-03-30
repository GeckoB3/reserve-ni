import { NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { FOUNDING_PARTNER_CAP } from '@/lib/pricing-constants';

/**
 * GET /api/signup/founding-spots
 * Public read: how many founding slots remain (for signup plan UI).
 */
export async function GET() {
  try {
    const admin = getSupabaseAdminClient();
    const { count, error } = await admin
      .from('venues')
      .select('id', { count: 'exact', head: true })
      .eq('pricing_tier', 'founding');

    if (error) {
      console.error('[founding-spots] count failed:', error);
      return NextResponse.json({ cap: FOUNDING_PARTNER_CAP, used: 0, remaining: FOUNDING_PARTNER_CAP });
    }

    const used = count ?? 0;
    const remaining = Math.max(0, FOUNDING_PARTNER_CAP - used);
    return NextResponse.json({ cap: FOUNDING_PARTNER_CAP, used, remaining });
  } catch (e) {
    console.error('[founding-spots]', e);
    return NextResponse.json({ cap: FOUNDING_PARTNER_CAP, used: 0, remaining: FOUNDING_PARTNER_CAP });
  }
}

import { getSupabaseAdminClient } from '@/lib/supabase';

/** Reserve NI Unified Scheduling Engine plan §1.1 — included SMS per paid calendar on Standard tier. */
export const SMS_INCLUDED_PER_CALENDAR_STANDARD = 200;

/** Plan §1.1 — flat monthly included SMS on Business (and Founding) tier. */
export const SMS_INCLUDED_BUSINESS_TIER = 800;

/**
 * Standard: 200 SMS × calendar_count (paid seats); Business / Founding: 800 flat.
 * Must match `venues.sms_monthly_allowance` persisted by `updateVenueSmsMonthlyAllowance`.
 * Call after subscription tier / calendar_count changes.
 */
export function computeSmsMonthlyAllowance(pricingTier: string, calendarCount: number | null): number {
  const tier = (pricingTier ?? 'standard').toLowerCase();
  if (tier === 'business' || tier === 'founding') {
    return SMS_INCLUDED_BUSINESS_TIER;
  }
  const n = Math.max(1, calendarCount ?? 1);
  return SMS_INCLUDED_PER_CALENDAR_STANDARD * n;
}

export async function updateVenueSmsMonthlyAllowance(venueId: string): Promise<void> {
  const admin = getSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('venues')
    .select('pricing_tier, calendar_count')
    .eq('id', venueId)
    .maybeSingle();
  if (error || !row) {
    console.warn('[sms-allowance] could not load venue', venueId, error?.message);
    return;
  }
  const allowance = computeSmsMonthlyAllowance(
    (row as { pricing_tier?: string }).pricing_tier ?? 'standard',
    (row as { calendar_count?: number | null }).calendar_count ?? 1,
  );
  await admin.from('venues').update({ sms_monthly_allowance: allowance }).eq('id', venueId);
}

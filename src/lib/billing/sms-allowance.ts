import { getSupabaseAdminClient } from '@/lib/supabase';

/** Included SMS per month on the Appointments plan (and legacy Standard). */
export const SMS_INCLUDED_APPOINTMENTS = 300;

/** Included SMS per month on the Restaurant plan (and legacy Business / Founding). */
export const SMS_INCLUDED_RESTAURANT = 800;

/** @deprecated Use SMS_INCLUDED_APPOINTMENTS. */
export const SMS_INCLUDED_PER_CALENDAR_STANDARD = SMS_INCLUDED_APPOINTMENTS;
/** @deprecated Use SMS_INCLUDED_RESTAURANT. */
export const SMS_INCLUDED_BUSINESS_TIER = SMS_INCLUDED_RESTAURANT;

/**
 * Appointments / Standard: 300 SMS flat; Restaurant / Business / Founding: 800 flat.
 * Must match `venues.sms_monthly_allowance` persisted by `updateVenueSmsMonthlyAllowance`.
 * Call after subscription tier changes.
 */
export function computeSmsMonthlyAllowance(pricingTier: string, _calendarCount: number | null): number {
  const tier = (pricingTier ?? 'appointments').toLowerCase();
  if (tier === 'restaurant' || tier === 'business' || tier === 'founding') {
    return SMS_INCLUDED_RESTAURANT;
  }
  return SMS_INCLUDED_APPOINTMENTS;
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

import { getSupabaseAdminClient } from '@/lib/supabase';

/** Included SMS per month on Appointments Pro (`pricing_tier` = appointments). */
export const SMS_INCLUDED_APPOINTMENTS = 800;

/** Included SMS per month on Appointments Plus. */
export const SMS_INCLUDED_PLUS = 300;

/** Included SMS per month on the Restaurant plan (and Founding). */
export const SMS_INCLUDED_RESTAURANT = 800;

/**
 * Light: 0; Plus: 300; Pro (appointments): 800; Restaurant / Founding: 800.
 * Must match `venues.sms_monthly_allowance` persisted by `updateVenueSmsMonthlyAllowance`.
 * Call after subscription tier changes.
 */
export function computeSmsMonthlyAllowance(pricingTier: string, _calendarCount: number | null): number {
  const tier = (pricingTier ?? 'appointments').toLowerCase();
  if (tier === 'light') {
    return 0;
  }
  if (tier === 'plus') {
    return SMS_INCLUDED_PLUS;
  }
  if (tier === 'restaurant' || tier === 'founding') {
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
    (row as { pricing_tier?: string }).pricing_tier ?? 'appointments',
    (row as { calendar_count?: number | null }).calendar_count ?? 1,
  );
  await admin.from('venues').update({ sms_monthly_allowance: allowance }).eq('id', venueId);
}

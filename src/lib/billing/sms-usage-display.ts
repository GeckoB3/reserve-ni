import type { SupabaseClient } from '@supabase/supabase-js';
import { computeSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';
import { SMS_OVERAGE_GBP_PER_MESSAGE } from '@/lib/pricing-constants';

function billingMonthFirstDayUtcYmd(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

export interface SmsUsageDisplay {
  messages_sent: number;
  messages_included: number;
  remaining: number;
  overage_count: number;
  overage_amount_pence: number;
}

/**
 * Current-month SMS figures for dashboard / settings.
 * Included count comes from `computeSmsMonthlyAllowance` (tier-based).
 */
export async function getSmsUsageDisplayForVenue(
  admin: SupabaseClient,
  venueId: string,
): Promise<SmsUsageDisplay | null> {
  const bm = billingMonthFirstDayUtcYmd();
  const { data: venue, error: vErr } = await admin
    .from('venues')
    .select('pricing_tier, calendar_count')
    .eq('id', venueId)
    .maybeSingle();
  if (vErr || !venue) return null;

  const row = venue as {
    pricing_tier?: string | null;
    calendar_count?: number | null;
  };
  const included = computeSmsMonthlyAllowance(row.pricing_tier ?? 'appointments', row.calendar_count ?? null);

  const { data: usage } = await admin
    .from('sms_usage')
    .select('messages_sent')
    .eq('venue_id', venueId)
    .eq('billing_month', bm)
    .maybeSingle();

  const u = usage as {
    messages_sent?: number;
  } | null;

  const sent = u?.messages_sent ?? 0;
  const remaining = Math.max(0, included - sent);
  const overageCount = Math.max(0, sent - included);
  const overagePence = overageCount * Math.round(SMS_OVERAGE_GBP_PER_MESSAGE * 100);

  return {
    messages_sent: sent,
    messages_included: included,
    remaining,
    overage_count: overageCount,
    overage_amount_pence: overagePence,
  };
}

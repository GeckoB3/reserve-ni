import { getSupabaseAdminClient } from '@/lib/supabase';
import { computeSmsMonthlyAllowance } from '@/lib/billing/sms-allowance';
import { isSuperuserFreeBillingAccess } from '@/lib/billing/billing-access-source';
import { isLightPlanTier } from '@/lib/tier-enforcement';

function billingMonthFirstDayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

/** Pure helper: true when another counted send would exceed the inclusive cap. */
export function wouldExceedSmsQuota(used: number, allowance: number, additionalSends = 1): boolean {
  return used + additionalSends > allowance;
}

type VenueSmsCountRow = {
  pricing_tier?: string | null;
  subscription_current_period_start?: string | null;
  subscription_current_period_end?: string | null;
};

/**
 * SMS sends counted this month for quota checks (aligned with Settings → Plan tab).
 */
export async function getSmsMessagesSentThisMonthForVenue(
  venueId: string,
  venue: VenueSmsCountRow,
): Promise<number> {
  const admin = getSupabaseAdminClient();
  const tier = String(venue.pricing_tier ?? '').toLowerCase();
  const periodStart = venue.subscription_current_period_start?.trim();
  const periodEnd = venue.subscription_current_period_end?.trim();
  if (tier === 'light' && periodStart && periodEnd) {
    const { count, error } = await admin
      .from('sms_log')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', venueId)
      .gte('sent_at', periodStart)
      .lt('sent_at', periodEnd);
    if (error) {
      console.error('[getSmsMessagesSentThisMonthForVenue] sms_log count failed:', error.message, { venueId });
      return 0;
    }
    return count ?? 0;
  }
  const bm = billingMonthFirstDayUtc();
  const { data: smsRow, error } = await admin
    .from('sms_usage')
    .select('messages_sent')
    .eq('venue_id', venueId)
    .eq('billing_month', bm)
    .maybeSingle();
  if (error) {
    console.error('[getSmsMessagesSentThisMonthForVenue] sms_usage read failed:', error.message, { venueId });
    return 0;
  }
  return (smsRow as { messages_sent?: number } | null)?.messages_sent ?? 0;
}

/**
 * For `billing_access_source = superuser_free`, block sends once included allowance is exhausted.
 * Paid Stripe accounts keep metered overage behaviour (no pre-send block here).
 */
export async function assertSmsSendWithinFreeAccessQuota(opts: {
  venueId: string;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const admin = getSupabaseAdminClient();
  const { data: venue, error } = await admin
    .from('venues')
    .select(
      'billing_access_source, sms_monthly_allowance, pricing_tier, calendar_count, subscription_current_period_start, subscription_current_period_end',
    )
    .eq('id', opts.venueId)
    .maybeSingle();
  if (error || !venue) {
    return { ok: true };
  }
  const row = venue as {
    billing_access_source?: string | null;
    sms_monthly_allowance?: number | null;
    pricing_tier?: string | null;
    calendar_count?: number | null;
    subscription_current_period_start?: string | null;
    subscription_current_period_end?: string | null;
  };
  if (!isSuperuserFreeBillingAccess(row.billing_access_source)) {
    return { ok: true };
  }
  const tier = row.pricing_tier ?? 'appointments';
  const allowance =
    row.sms_monthly_allowance ?? computeSmsMonthlyAllowance(tier, row.calendar_count ?? null);
  const used = await getSmsMessagesSentThisMonthForVenue(opts.venueId, row);
  if (wouldExceedSmsQuota(used, allowance, 1)) {
    return {
      ok: false,
      reason: `SMS allowance exhausted for this venue (${used}/${allowance} this month, free access).`,
    };
  }
  return { ok: true };
}

/**
 * Persist SMS to sms_log and increment monthly usage (metered billing data).
 */
export async function recordOutboundSms(opts: {
  venueId: string;
  bookingId?: string;
  messageType: string;
  recipientPhone: string;
  twilioSid?: string;
  segmentCount: number;
}): Promise<void> {
  try {
    const admin = getSupabaseAdminClient();
    const billingMonth = billingMonthFirstDayUtc();

    await admin.from('sms_log').insert({
      venue_id: opts.venueId,
      booking_id: opts.bookingId ?? null,
      message_type: opts.messageType,
      recipient_phone: opts.recipientPhone,
      twilio_message_sid: opts.twilioSid ?? null,
      status: 'sent',
      segment_count: Math.max(1, opts.segmentCount),
    });

    const { error } = await admin.rpc('increment_sms_usage', {
      p_venue_id: opts.venueId,
      p_billing_month: billingMonth,
    });

    if (error) {
      console.error('[recordOutboundSms] increment_sms_usage failed:', error.message, { venueId: opts.venueId });
      return;
    }

    const { data: venueRow } = await admin
      .from('venues')
      .select('pricing_tier, stripe_sms_subscription_item_id')
      .eq('id', opts.venueId)
      .maybeSingle();
    const tier = (venueRow as { pricing_tier?: string | null } | null)?.pricing_tier;
    const smsItemId = (venueRow as { stripe_sms_subscription_item_id?: string | null } | null)
      ?.stripe_sms_subscription_item_id?.trim();
    if (isLightPlanTier(tier) && smsItemId) {
      const secret = process.env.STRIPE_SECRET_KEY;
      if (secret) {
        try {
          const params = new URLSearchParams();
          params.set('quantity', '1');
          params.set('timestamp', String(Math.floor(Date.now() / 1000)));
          params.set('action', 'increment');
          const res = await fetch(
            `https://api.stripe.com/v1/subscription_items/${encodeURIComponent(smsItemId)}/usage_records`,
            {
              method: 'POST',
              headers: {
                Authorization: `Bearer ${secret}`,
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: params.toString(),
            },
          );
          if (!res.ok) {
            const errText = await res.text();
            console.error('[recordOutboundSms] Stripe usage record failed:', res.status, errText, {
              venueId: opts.venueId,
            });
          }
        } catch (stripeErr) {
          console.error('[recordOutboundSms] Stripe usage record failed:', stripeErr, { venueId: opts.venueId });
        }
      }
    }
  } catch (err) {
    console.error('[recordOutboundSms] failed:', err);
  }
}

export function estimateSmsSegments(body: string): number {
  const hasNonGsm = /[^\u0000-\u007F\u00A1-\u00FF]/.test(body);
  const limit = hasNonGsm ? 70 : 160;
  return Math.max(1, Math.ceil(body.length / limit));
}

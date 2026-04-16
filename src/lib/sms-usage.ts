import { getSupabaseAdminClient } from '@/lib/supabase';
import { isLightPlanTier } from '@/lib/tier-enforcement';

function billingMonthFirstDayUtc(): string {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
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

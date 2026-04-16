import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { requireCronAuthorisation } from '@/lib/cron-auth';

/**
 * Monthly: report SMS overage to Stripe metered price (runs 1st of month).
 * Uses Stripe REST usage records API (metered subscription item).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuthorisation(request);
  if (denied) return denied;

  const secret = process.env.STRIPE_SECRET_KEY;
  if (!secret) {
    return NextResponse.json({ ok: true, skipped: true, reason: 'STRIPE_SECRET_KEY not set' });
  }

  const admin = getSupabaseAdminClient();

  const now = new Date();
  const prevMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const prevMonthStr = prevMonth.toISOString().slice(0, 10);

  const { data: rows, error } = await admin
    .from('sms_usage')
    .select('id, venue_id, overage_count, billing_month')
    .eq('billing_month', prevMonthStr)
    .eq('overage_billed', false)
    .gt('overage_count', 0);

  if (error) {
    console.error('[sms-overage-billing] query failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let reported = 0;
  for (const row of rows ?? []) {
    const r = row as { id: string; venue_id: string; overage_count: number };
    const { data: venue } = await admin
      .from('venues')
      .select('stripe_sms_subscription_item_id, pricing_tier')
      .eq('id', r.venue_id)
      .maybeSingle();

    const tier = ((venue as { pricing_tier?: string | null } | null)?.pricing_tier ?? '').toLowerCase().trim();
    if (tier === 'light') {
      continue;
    }

    const itemId = (venue as { stripe_sms_subscription_item_id?: string | null } | null)
      ?.stripe_sms_subscription_item_id;
    if (!itemId) {
      console.warn('[sms-overage-billing] no stripe_sms_subscription_item_id for venue', r.venue_id);
      continue;
    }

    try {
      const params = new URLSearchParams();
      params.set('quantity', String(r.overage_count));
      params.set('timestamp', String(Math.floor(Date.now() / 1000)));
      params.set('action', 'increment');

      const res = await fetch(
        `https://api.stripe.com/v1/subscription_items/${encodeURIComponent(itemId)}/usage_records`,
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
        console.error('[sms-overage-billing] Stripe API error:', res.status, errText);
        continue;
      }

      await admin.from('sms_usage').update({ overage_billed: true }).eq('id', r.id);
      reported++;
    } catch (e) {
      console.error('[sms-overage-billing] Stripe usage record failed:', r.venue_id, e);
    }
  }

  return NextResponse.json({ ok: true, previous_month: prevMonthStr, reported });
}

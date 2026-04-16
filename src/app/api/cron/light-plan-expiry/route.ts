import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { requireCronAuthorisation } from '@/lib/cron-auth';
import { stripe } from '@/lib/stripe';
import { sendEmail } from '@/lib/emails/send-email';

/**
 * Daily: Appointments Light free-period reminders and expiry (9am UTC via vercel.json).
 */
export async function GET(request: NextRequest) {
  const denied = requireCronAuthorisation(request);
  if (denied) return denied;

  const admin = getSupabaseAdminClient();
  const now = new Date();
  const msPerDay = 86_400_000;

  const { data: lightVenues, error } = await admin
    .from('venues')
    .select(
      'id, name, plan_status, pricing_tier, light_plan_free_period_ends_at, stripe_customer_id, stripe_subscription_id, light_plan_grace_followup_sent_at',
    )
    .eq('pricing_tier', 'light');

  if (error) {
    console.error('[light-plan-expiry] query failed:', error.message);
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  let expiredToPastDue = 0;
  let reminder14 = 0;
  let reminder7 = 0;
  let convertedLogged = 0;
  let graceFollowup3d = 0;

  for (const row of lightVenues ?? []) {
    const v = row as {
      id: string;
      name: string | null;
      plan_status: string | null;
      light_plan_free_period_ends_at: string | null;
      stripe_customer_id: string | null;
      stripe_subscription_id: string | null;
    };

    const endRaw = v.light_plan_free_period_ends_at;
    if (!endRaw) continue;
    const end = new Date(endRaw);
    if (Number.isNaN(end.getTime())) continue;

    const daysUntilEnd = Math.ceil((end.getTime() - now.getTime()) / msPerDay);

    const { data: adminRows } = await admin
      .from('staff')
      .select('email')
      .eq('venue_id', v.id)
      .eq('role', 'admin')
      .limit(1);
    const ownerEmail = (adminRows?.[0] as { email?: string } | undefined)?.email?.trim();
    if (ownerEmail && daysUntilEnd === 14) {
      const sent = await sendLightReminderEmail(
        ownerEmail,
        v.name ?? 'your business',
        end,
        'Your Reserve NI free period ends in 14 days',
      );
      if (sent) reminder14++;
    }
    if (ownerEmail && daysUntilEnd === 7) {
      const sent = await sendLightReminderEmail(
        ownerEmail,
        v.name ?? 'your business',
        end,
        'Your Reserve NI free period ends in 7 days',
      );
      if (sent) reminder7++;
    }

    if (v.plan_status !== 'active') continue;

    if (end > now) continue;

    if (v.stripe_subscription_id) {
      await admin
        .from('venues')
        .update({ light_plan_converted_at: new Date().toISOString() })
        .eq('id', v.id);
      convertedLogged++;
      continue;
    }

    const hasPm = await customerHasPaymentMethod(v.stripe_customer_id);
    if (hasPm) {
      console.warn(
        '[light-plan-expiry] venue has payment method but no subscription — manual subscription creation may be required',
        { venueId: v.id },
      );
      continue;
    }

    await admin.from('venues').update({ plan_status: 'past_due' }).eq('id', v.id);
    expiredToPastDue++;
  }

  const { data: graceCandidates, error: graceErr } = await admin
    .from('venues')
    .select(
      'id, name, plan_status, light_plan_free_period_ends_at, light_plan_grace_followup_sent_at',
    )
    .eq('pricing_tier', 'light')
    .eq('plan_status', 'past_due');

  if (graceErr) {
    console.error('[light-plan-expiry] grace query failed:', graceErr.message);
  } else {
    const graceMs = 3 * msPerDay;
    for (const row of graceCandidates ?? []) {
      const g = row as {
        id: string;
        name: string | null;
        plan_status: string | null;
        light_plan_free_period_ends_at: string | null;
        light_plan_grace_followup_sent_at: string | null;
      };
      if (g.light_plan_grace_followup_sent_at) continue;
      const endRaw = g.light_plan_free_period_ends_at;
      if (!endRaw) continue;
      const end = new Date(endRaw);
      if (Number.isNaN(end.getTime())) continue;
      if (now.getTime() < end.getTime() + graceMs) continue;

      const { data: adminRows } = await admin
        .from('staff')
        .select('email')
        .eq('venue_id', g.id)
        .eq('role', 'admin')
        .limit(1);
      const ownerEmail = (adminRows?.[0] as { email?: string } | undefined)?.email?.trim();
      if (!ownerEmail) continue;

      const sent = await sendLightGraceFollowupEmail(ownerEmail, g.name ?? 'your business', end);
      if (sent) {
        await admin
          .from('venues')
          .update({ light_plan_grace_followup_sent_at: new Date().toISOString() })
          .eq('id', g.id);
        graceFollowup3d++;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    expired_to_past_due: expiredToPastDue,
    reminders_14d: reminder14,
    reminders_7d: reminder7,
    converted_logged: convertedLogged,
    grace_followup_3d: graceFollowup3d,
  });
}

async function customerHasPaymentMethod(customerId: string | null): Promise<boolean> {
  if (!customerId?.trim()) return false;
  try {
    const c = await stripe.customers.retrieve(customerId, {
      expand: ['invoice_settings.default_payment_method'],
    });
    const def = (c as { invoice_settings?: { default_payment_method?: unknown } }).invoice_settings
      ?.default_payment_method;
    if (typeof def === 'string' && def) return true;
    if (def && typeof def === 'object') return true;
    return Boolean((c as { default_source?: unknown }).default_source);
  } catch {
    return false;
  }
}

async function sendLightGraceFollowupEmail(
  to: string,
  venueName: string,
  freeEnded: Date,
): Promise<boolean> {
  const dateStr = freeEnded.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const body = `Hi,

Your Appointments Light free period for ${venueName} ended on ${dateStr}. Your account is still past due — add a payment method under Reserve NI → Settings → Plan to restore your live booking page and avoid losing access.

If you need help, reply to this email.

— Reserve NI`;

  const id = await sendEmail({
    to,
    subject: 'Your Reserve NI plan — payment still needed',
    text: body,
    html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
  });
  return Boolean(id);
}

async function sendLightReminderEmail(
  to: string,
  venueName: string,
  end: Date,
  subject: string,
): Promise<boolean> {
  const dateStr = end.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const body = `Hi,

Your Appointments Light free period for ${venueName} ends on ${dateStr}. After that, your plan continues at £5/month. Add a payment method in the dashboard under Plan & Billing before that date to keep your booking page live.

All your bookings and settings stay in place.

— Reserve NI`;

  const id = await sendEmail({
    to,
    subject,
    text: body,
    html: `<p>${body.replace(/\n/g, '<br/>')}</p>`,
  });
  return Boolean(id);
}

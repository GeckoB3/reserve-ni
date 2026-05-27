/**
 * Trial-window breakdown for the venue Plan tab (Settings → Plan).
 *
 * Surfaces:
 *   - days remaining until first charge,
 *   - the 14-day standard trial portion,
 *   - any 30-day referral bonus applied at signup (and who referred them).
 *
 * Computed purely from venue snapshot + (optional) referral row — no Stripe call.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { SIGNUP_TRIAL_DAYS } from '@/lib/signup-trial-copy';
import { REFERRAL_REFEREE_BONUS_DAYS } from '@/lib/referrals/constants';

export interface VenueTrialBreakdown {
  /** True when the venue is currently in a Stripe trial (plan_status='trialing'). */
  isTrialing: boolean;
  /** ISO timestamps for the trial window (during trial these match Stripe's current period). */
  trialStartIso: string | null;
  trialEndIso: string | null;
  /** Whole-day countdown until the trial ends. 0 once the end date has passed. */
  daysRemaining: number;
  /** Total trial length in whole days (e.g. 14 standard, 44 with referral). */
  totalDays: number;
  /** Always SIGNUP_TRIAL_DAYS (14). */
  standardDays: number;
  /** Referral bonus portion of the trial (30 if a referral attached at signup, 0 otherwise). */
  referralBonusDays: number;
  /** Display name of the referrer venue when a referral applied. */
  referrerVenueName: string | null;
  /** True when a referrals row exists for this venue at any status. */
  hasReferralAttached: boolean;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function diffWholeDays(fromIso: string, toIso: string): number {
  const from = Date.parse(fromIso);
  const to = Date.parse(toIso);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return 0;
  return Math.max(0, Math.round((to - from) / MS_PER_DAY));
}

function ceilDaysUntil(targetIso: string, now: Date = new Date()): number {
  const target = Date.parse(targetIso);
  if (!Number.isFinite(target)) return 0;
  const diff = target - now.getTime();
  if (diff <= 0) return 0;
  return Math.ceil(diff / MS_PER_DAY);
}

/**
 * Computes trial-window breakdown from already-loaded venue fields + referral row.
 *
 * `referrerVenueName` is read from a separate referrer lookup the caller does (we only
 * need the name; we don't pull the full referrer record here).
 */
export function computeTrialBreakdown(params: {
  planStatus: string | null | undefined;
  subscriptionCurrentPeriodStart: string | null | undefined;
  subscriptionCurrentPeriodEnd: string | null | undefined;
  referralAttached: boolean;
  referrerVenueName: string | null;
  /** Optional clock injection for tests. */
  now?: Date;
}): VenueTrialBreakdown {
  const planStatus = (params.planStatus ?? '').toLowerCase();
  const isTrialing = planStatus === 'trialing';
  const trialStartIso = params.subscriptionCurrentPeriodStart ?? null;
  const trialEndIso = params.subscriptionCurrentPeriodEnd ?? null;

  const standardDays = SIGNUP_TRIAL_DAYS;
  const referralBonusDays = params.referralAttached ? REFERRAL_REFEREE_BONUS_DAYS : 0;

  let totalDays = standardDays + referralBonusDays;
  if (trialStartIso && trialEndIso) {
    const observed = diffWholeDays(trialStartIso, trialEndIso);
    // Prefer the observed value when it's larger (handles future trial-length config changes).
    if (observed > totalDays) totalDays = observed;
  }

  const daysRemaining = isTrialing && trialEndIso ? ceilDaysUntil(trialEndIso, params.now) : 0;

  return {
    isTrialing,
    trialStartIso,
    trialEndIso,
    daysRemaining,
    totalDays,
    standardDays,
    referralBonusDays,
    referrerVenueName: params.referrerVenueName?.trim() || null,
    hasReferralAttached: params.referralAttached,
  };
}

/**
 * Server helper: looks up the venue's referral row (if any) and computes the breakdown.
 * Returns null when the venue isn't in a trial — callers can skip rendering.
 */
export async function loadVenueTrialBreakdown(
  admin: SupabaseClient,
  params: {
    venueId: string;
    planStatus: string | null;
    subscriptionCurrentPeriodStart: string | null;
    subscriptionCurrentPeriodEnd: string | null;
  },
): Promise<VenueTrialBreakdown | null> {
  // We only need the trial breakdown while trialing. For non-trialing venues we still
  // expose the referral source if the next bill happens to land in a trial-extended
  // window — but those cases don't apply: outside trialing, daysRemaining=0 and the
  // banner is redundant with the standard "next billing" UI.
  if ((params.planStatus ?? '').toLowerCase() !== 'trialing') {
    return null;
  }

  // Lookup referral row for this venue (as the referee). At most one (UNIQUE constraint).
  const { data: referralRow } = await admin
    .from('referrals')
    .select('referrer_venue_id, status')
    .eq('referred_venue_id', params.venueId)
    .maybeSingle();

  let referrerVenueName: string | null = null;
  let referralAttached = false;
  if (referralRow) {
    const referrerId = (referralRow as { referrer_venue_id?: string | null }).referrer_venue_id;
    const status = (referralRow as { status?: string | null }).status;
    // Treat as "attached" for trial-breakdown purposes when the referral was either
    // pending/active or already credited. Void/failed referrals mean the bonus may
    // have been retracted — still surface the name but the bonus stays applied
    // (Stripe already extended the trial; we don't claw it back mid-trial).
    referralAttached = Boolean(referrerId) && status !== 'void' && status !== 'failed';
    if (referrerId) {
      const { data: referrerRow } = await admin
        .from('venues')
        .select('name')
        .eq('id', referrerId)
        .maybeSingle();
      const name = (referrerRow as { name?: string | null } | null)?.name?.trim();
      if (name) referrerVenueName = name;
    }
  }

  return computeTrialBreakdown({
    planStatus: params.planStatus,
    subscriptionCurrentPeriodStart: params.subscriptionCurrentPeriodStart,
    subscriptionCurrentPeriodEnd: params.subscriptionCurrentPeriodEnd,
    referralAttached,
    referrerVenueName,
  });
}

import { describe, expect, it } from 'vitest';
import {
  shouldPauseSubscriptionOnTrialEndPaymentFailure,
  TRIAL_END_PAYMENT_FAILURE_WINDOW_SECONDS,
} from '@/lib/stripe/trial-end-payment';

describe('shouldPauseSubscriptionOnTrialEndPaymentFailure', () => {
  const trialEnd = 1_700_000_000;

  it('returns true for past_due subscription shortly after trial end with a due invoice', () => {
    expect(
      shouldPauseSubscriptionOnTrialEndPaymentFailure(
        { trial_end: trialEnd, status: 'past_due' },
        { billing_reason: 'subscription_cycle', amount_due: 2000 },
        trialEnd + 3600,
      ),
    ).toBe(true);
  });

  it('returns false when still in trial', () => {
    expect(
      shouldPauseSubscriptionOnTrialEndPaymentFailure(
        { trial_end: trialEnd, status: 'past_due' },
        { billing_reason: 'subscription_cycle', amount_due: 2000 },
        trialEnd - 60,
      ),
    ).toBe(false);
  });

  it('returns false when trial ended outside the pause window', () => {
    expect(
      shouldPauseSubscriptionOnTrialEndPaymentFailure(
        { trial_end: trialEnd, status: 'past_due' },
        { billing_reason: 'subscription_cycle', amount_due: 2000 },
        trialEnd + TRIAL_END_PAYMENT_FAILURE_WINDOW_SECONDS + 1,
      ),
    ).toBe(false);
  });

  it('returns false for zero-amount invoices', () => {
    expect(
      shouldPauseSubscriptionOnTrialEndPaymentFailure(
        { trial_end: trialEnd, status: 'past_due' },
        { billing_reason: 'subscription_cycle', amount_due: 0 },
        trialEnd + 3600,
      ),
    ).toBe(false);
  });

  it('returns false when subscription is already paused', () => {
    expect(
      shouldPauseSubscriptionOnTrialEndPaymentFailure(
        { trial_end: trialEnd, status: 'paused' },
        { billing_reason: 'subscription_cycle', amount_due: 2000 },
        trialEnd + 3600,
      ),
    ).toBe(false);
  });
});

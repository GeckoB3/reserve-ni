import { describe, expect, it } from 'vitest';
import { decideClassLineEntitlement } from '@/lib/class-commerce/entitlement-engine';

describe('decideClassLineEntitlement', () => {
  it('returns free when there is no online charge', () => {
    const d = decideClassLineEntitlement({
      onlineChargePence: 0,
      paymentRequirement: 'none',
      creditsAvailableForClassType: 5,
      partySize: 2,
    });
    expect(d.kind).toBe('free');
    expect(d.stripeAmountPence).toBe(0);
  });

  it('prefers credits when balance covers party size', () => {
    const d = decideClassLineEntitlement({
      onlineChargePence: 2500,
      paymentRequirement: 'full_payment',
      creditsAvailableForClassType: 2,
      partySize: 2,
    });
    expect(d.kind).toBe('credits');
    expect(d.creditsToRedeem).toBe(2);
  });

  it('falls back to stripe when insufficient credits', () => {
    const d = decideClassLineEntitlement({
      onlineChargePence: 1200,
      paymentRequirement: 'deposit',
      creditsAvailableForClassType: 1,
      partySize: 2,
    });
    expect(d.kind).toBe('stripe');
    expect(d.stripeAmountPence).toBe(1200);
  });
});

import { describe, expect, it } from 'vitest';

/**
 * Mirrors the class_session branch in POST /api/booking/create:
 * Stripe deposit only when online payment is required and list price is positive.
 */
function classSessionRequiresStripeDeposit(cls: {
  requires_online_payment: boolean;
  price_pence: number | null;
}): boolean {
  return (
    cls.requires_online_payment &&
    cls.price_pence != null &&
    cls.price_pence > 0
  );
}

describe('class_session Stripe deposit rule', () => {
  it('requires deposit when online payment is on and price is set', () => {
    expect(
      classSessionRequiresStripeDeposit({
        requires_online_payment: true,
        price_pence: 500,
      }),
    ).toBe(true);
  });

  it('skips deposit when online payment is off even if price is set', () => {
    expect(
      classSessionRequiresStripeDeposit({
        requires_online_payment: false,
        price_pence: 500,
      }),
    ).toBe(false);
  });

  it('skips deposit when price is zero or null', () => {
    expect(
      classSessionRequiresStripeDeposit({
        requires_online_payment: true,
        price_pence: 0,
      }),
    ).toBe(false);
    expect(
      classSessionRequiresStripeDeposit({
        requires_online_payment: true,
        price_pence: null,
      }),
    ).toBe(false);
  });
});

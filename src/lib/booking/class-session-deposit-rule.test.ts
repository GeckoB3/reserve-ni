import { describe, expect, it } from 'vitest';
import type { ClassPaymentRequirement } from '@/types/booking-models';

/**
 * Mirrors Stripe requirement for class_session from availability slot fields.
 */
function classSessionRequiresStripeDeposit(slot: {
  payment_requirement: ClassPaymentRequirement;
  price_pence: number | null;
  deposit_amount_pence: number | null;
}): boolean {
  if (slot.payment_requirement === 'full_payment') return (slot.price_pence ?? 0) > 0;
  if (slot.payment_requirement === 'deposit') return (slot.deposit_amount_pence ?? 0) > 0;
  return false;
}

describe('class_session Stripe deposit rule', () => {
  it('requires deposit when full_payment and price is set', () => {
    expect(
      classSessionRequiresStripeDeposit({
        payment_requirement: 'full_payment',
        price_pence: 500,
        deposit_amount_pence: null,
      }),
    ).toBe(true);
  });

  it('requires deposit when deposit mode and deposit per person set', () => {
    expect(
      classSessionRequiresStripeDeposit({
        payment_requirement: 'deposit',
        price_pence: 1000,
        deposit_amount_pence: 300,
      }),
    ).toBe(true);
  });

  it('skips Stripe for none even if price is set', () => {
    expect(
      classSessionRequiresStripeDeposit({
        payment_requirement: 'none',
        price_pence: 500,
        deposit_amount_pence: null,
      }),
    ).toBe(false);
  });

  it('skips when price is zero for full_payment', () => {
    expect(
      classSessionRequiresStripeDeposit({
        payment_requirement: 'full_payment',
        price_pence: 0,
        deposit_amount_pence: null,
      }),
    ).toBe(false);
  });
});

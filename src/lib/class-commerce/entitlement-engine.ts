import type { ClassPaymentRequirement } from '@/types/booking-models';

export type ClassLineEntitlementKind = 'free' | 'stripe' | 'credits';

export interface ClassLineEntitlementDecision {
  kind: ClassLineEntitlementKind;
  /** Card amount in pence when `kind === 'stripe'`. */
  stripeAmountPence: number;
  /** Credits to redeem when `kind === 'credits'` (typically party size). */
  creditsToRedeem: number;
  paymentRequirement: ClassPaymentRequirement;
}

/**
 * Decide how a single class cart line should be settled given quote inputs and optional credit balance.
 * UI may still let the guest choose card vs credits when both are valid.
 */
export function decideClassLineEntitlement(params: {
  onlineChargePence: number;
  paymentRequirement: ClassPaymentRequirement;
  creditsAvailableForClassType: number;
  partySize: number;
}): ClassLineEntitlementDecision {
  const { onlineChargePence, paymentRequirement, creditsAvailableForClassType, partySize } = params;

  if (onlineChargePence <= 0) {
    return {
      kind: 'free',
      stripeAmountPence: 0,
      creditsToRedeem: 0,
      paymentRequirement,
    };
  }

  if (creditsAvailableForClassType >= partySize) {
    return {
      kind: 'credits',
      stripeAmountPence: 0,
      creditsToRedeem: partySize,
      paymentRequirement,
    };
  }

  return {
    kind: 'stripe',
    stripeAmountPence: onlineChargePence,
    creditsToRedeem: 0,
    paymentRequirement,
  };
}

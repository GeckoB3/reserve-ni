/** Stored on the auth user while signup is in progress (before a venue exists). */
export const SIGNUP_PENDING_PLAN_KEY = 'signup_pending_plan';
export const SIGNUP_PENDING_BUSINESS_TYPE_KEY = 'signup_pending_business_type';

export type SignupPendingPlan = 'appointments' | 'plus' | 'light' | 'restaurant' | 'founding';

/**
 * True when the user has progressed far enough in the funnel to show the order summary / payment step.
 * Mirrors sessionStorage rules on the payment page and create-checkout validation.
 */
export function isSignupPaymentReady(
  plan: SignupPendingPlan | string | null | undefined,
  businessType: string | null | undefined,
): boolean {
  if (!plan) return false;
  if (plan === 'appointments' || plan === 'plus' || plan === 'light') return true;
  if (plan === 'restaurant' || plan === 'founding') return !!businessType?.trim();
  return false;
}

/**
 * After auth (sign-up, email link, or login), where to send the user next in the signup funnel.
 * Plan + business type are stored in sessionStorage during the public pricing flow before account creation.
 */
export function getSignupResumePath(): string {
  if (typeof window === 'undefined') return '/signup/business-type';
  const bt = sessionStorage.getItem('signup_business_type');
  const p = sessionStorage.getItem('signup_plan');
  if (bt && p) return '/signup/payment';
  return '/signup/business-type';
}

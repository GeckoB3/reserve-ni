/**
 * `venues.business_type` for restaurant / founding signups when no hospitality sub-type is chosen.
 * Maps to `BUSINESS_TYPE_CONFIG.restaurant` (table reservation, hospitality).
 */
export const DEFAULT_RESTAURANT_FAMILY_BUSINESS_TYPE = 'restaurant';

/**
 * Ensures sessionStorage has `signup_business_type` for restaurant/founding plans (hospitality picker removed).
 */
export function ensureDefaultRestaurantFamilyBusinessType(): void {
  if (typeof window === 'undefined') return;
  const p = sessionStorage.getItem('signup_plan');
  if (p === 'restaurant' || p === 'founding') {
    if (!sessionStorage.getItem('signup_business_type')) {
      sessionStorage.setItem('signup_business_type', DEFAULT_RESTAURANT_FAMILY_BUSINESS_TYPE);
    }
  }
}

/**
 * After auth (sign-up, email link, or login), where to send the user next in the signup funnel.
 * Plan + business type are stored in sessionStorage during the public pricing flow before account creation.
 */
export function getSignupResumePath(): string {
  if (typeof window === 'undefined') return '/signup/business-type';
  ensureDefaultRestaurantFamilyBusinessType();
  const bt = sessionStorage.getItem('signup_business_type');
  const p = sessionStorage.getItem('signup_plan');
  if (p === 'appointments' || p === 'light') return '/signup/payment';
  if (bt && p) return '/signup/payment';
  return '/signup/business-type';
}

/**
 * Entitlement precedence for class checkout (lowest → highest impact on price).
 * See Docs/CLASS_COMMERCE_PRODUCT_RULES.md §1.
 */
export const CLASS_ENTITLEMENT_ORDER = [
  'drop_in_price',
  'membership_benefit',
  'course_enrollment',
  'class_credits',
  'promo_or_admin',
] as const;

export type ClassEntitlementKind = (typeof CLASS_ENTITLEMENT_ORDER)[number];

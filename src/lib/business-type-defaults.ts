/**
 * Canonical entry for “business type → defaults” used by onboarding and signup.
 * Implementation lives in {@link ./business-config}; this module exists so documentation
 * referencing `business-type-defaults.ts` matches the codebase.
 */
export {
  getBusinessConfig,
  getBusinessTypesByCategory,
  BUSINESS_TYPE_CONFIG,
  BOOKING_MODEL_CHIP_LABEL,
  BOOKING_MODEL_SIGNUP_CARDS,
  SIGNUP_SUPPORTED_BOOKING_MODELS,
  isSignupSupportedBookingModel,
  isDirectModelBusinessType,
  directModelBusinessTypeKey,
  formatSignupBusinessTypeLabel,
  type BusinessConfig,
  type DefaultService,
  type BookingModelSignupCard,
} from './business-config';

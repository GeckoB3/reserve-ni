/** How long a guest has to respond before an auto-offered waitlist slot expires. */
export const APPOINTMENT_WAITLIST_OFFER_TTL_MS = 30 * 60 * 1000;

/** Appointment waitlist entries are complete once the guest has been notified of an offer. */
export const APPOINTMENT_WAITLIST_COMPLETED_STATUS = 'confirmed' as const;

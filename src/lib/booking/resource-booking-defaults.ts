/**
 * Defaults for resource slot grid / booking length when values are omitted (API, UI, fallbacks).
 * Keep in sync across POST /api/venue/resources, dashboard form, and onboarding.
 */
export const DEFAULT_RESOURCE_SLOT_INTERVAL_MINUTES = 30;
export const DEFAULT_RESOURCE_MIN_BOOKING_MINUTES = 30;

/** When "shortest booking follows start-time step", enforce venue minimum (e.g. 15) but match slot when slot ≥ that floor. */
export function syncedMinBookingMinutesFromSlot(
  slotMinutes: number,
  shortestBookingFloorMinutes: number,
): number {
  if (!Number.isFinite(slotMinutes)) return shortestBookingFloorMinutes;
  return Math.max(shortestBookingFloorMinutes, slotMinutes);
}

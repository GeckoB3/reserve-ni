/**
 * Venue `terminology` JSONB (Unified Scheduling plan §6.4).
 * Keys may include `booking`, `bookings`, `client`, `clients`, etc.
 */
export function venueTermLabel(
  terminology: Record<string, unknown> | null | undefined,
  key: string,
  fallback: string,
): string {
  const v = terminology?.[key];
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : fallback;
}

/**
 * Wall-clock date and time in a venue IANA timezone (e.g. Europe/London).
 * Used for same-day booking cutoffs so server UTC does not leak into guest UX.
 */

export function getVenueLocalDateAndMinutes(timezone: string, at: Date = new Date()): {
  dateYmd: string;
  minutesSinceMidnight: number;
} {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(at);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    dateYmd: `${get('year')}-${get('month')}-${get('day')}`,
    minutesSinceMidnight: Number(get('hour')) * 60 + Number(get('minute')),
  };
}

import { currencySymbolFromCode } from '@/lib/money/currency-symbol';

/**
 * Booking-status badge classes used by practitioner-calendar instance detail
 * sheets (class & event). Distinct from public-booking pills because the
 * dashboard shows ring-shaded pastel chips inside attendee tables.
 */
export const PRACTITIONER_BOOKING_STATUS_BADGE: Record<string, string> = {
  Pending: 'bg-orange-100 text-orange-900 ring-1 ring-orange-200/80',
  Booked: 'bg-sky-100 text-sky-900 ring-1 ring-sky-200/80',
  Confirmed: 'bg-emerald-100 text-emerald-900 ring-1 ring-emerald-200/80',
  Seated: 'bg-violet-100 text-violet-900 ring-1 ring-violet-200/80',
  Completed: 'bg-teal-100 text-teal-900 ring-1 ring-teal-200/80',
  'No-Show': 'bg-red-100 text-red-900 ring-1 ring-red-200/70',
  Cancelled: 'bg-slate-100 text-slate-500 ring-1 ring-slate-200/80',
};

/**
 * Format pence as a dashboard money string. Renders an em-dash for null
 * (vs the guest-facing "Free" semantics in `format-price-display.ts`).
 */
export function formatDashboardMoneyPence(
  pence: number | null | undefined,
  currency: string,
): string {
  if (pence == null) return '—';
  return `${currencySymbolFromCode(currency)}${(pence / 100).toFixed(2)}`;
}

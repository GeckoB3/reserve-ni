/**
 * ISO timestamp for the last moment a client can cancel and still receive a deposit refund:
 * appointment start minus `hoursBefore` (UTC, consistent with existing booking rows).
 */
export function cancellationDeadlineHoursBefore(
  bookingDate: string,
  bookingTime: string,
  hoursBefore: number,
): string {
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - hoursBefore);
  return dt.toISOString();
}

/** Human-readable last moment for refund (London), aligned with `cancellationDeadlineHoursBefore`. */
export function formatRefundDeadlineDisplay(
  bookingDate: string,
  bookingTime: string,
  noticeHours: number,
): string {
  const iso = cancellationDeadlineHoursBefore(bookingDate, bookingTime, noticeHours);
  return formatRefundDeadlineIso(iso);
}

/** Human-readable instant for a stored cancellation_deadline ISO (same as computed deadline display). */
export function formatRefundDeadlineIso(deadlineIso: string): string {
  const d = new Date(deadlineIso);
  if (Number.isNaN(d.getTime())) return deadlineIso;
  return d.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

/**
 * True if the guest can still cancel for a deposit refund at time `at`
 * (i.e. before the stored cancellation_deadline instant).
 */
export function isDepositRefundAvailableAt(deadlineIso: string, at: Date = new Date()): boolean {
  const t = new Date(deadlineIso).getTime();
  if (Number.isNaN(t)) return false;
  return at.getTime() < t;
}

export type GroupDepositRefundClass = 'all_refundable' | 'none_refundable' | 'mixed';

/** Classify each appointment slot for group bookings (same notice hours for all). */
export function classifyGroupDepositRefunds(
  slots: Array<{ date: string; time: string }>,
  noticeHours: number,
  at: Date = new Date(),
): GroupDepositRefundClass {
  if (slots.length === 0) return 'none_refundable';
  const flags = slots.map((s) =>
    isDepositRefundAvailableAt(cancellationDeadlineHoursBefore(s.date, s.time, noticeHours), at),
  );
  const any = flags.some(Boolean);
  const all = flags.every(Boolean);
  if (all) return 'all_refundable';
  if (!any) return 'none_refundable';
  return 'mixed';
}

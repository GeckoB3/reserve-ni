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
  const [y, m, d] = bookingDate.split('-').map(Number);
  const [hh, mm] = bookingTime.slice(0, 5).split(':').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!, hh, mm, 0));
  dt.setHours(dt.getHours() - noticeHours);
  return dt.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/London',
  });
}

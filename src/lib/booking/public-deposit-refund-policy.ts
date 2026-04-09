/**
 * Guest-facing copy for paid online deposits / full prepayment (Stripe checkout).
 * Hours should match `resolveCancellationNoticeHoursForCreate` / per-entity `cancellation_notice_hours`.
 */

export function formatOnlinePaidRefundPolicyLine(refundNoticeHours: number): string {
  const h = Math.max(0, Math.round(refundNoticeHours));
  return `Full refund if you cancel ${h}+ hours before the scheduled start. No refund within ${h} hours of the start time or for no-shows.`;
}

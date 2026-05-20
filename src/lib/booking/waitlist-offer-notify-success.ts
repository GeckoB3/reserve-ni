import type { AppointmentWaitlistOfferNotifyResult } from '@/lib/communications/send-appointment-waitlist-offer';

/** True when at least one configured channel successfully delivered the offer. */
export function wasWaitlistOfferNotifySuccessful(
  notify: AppointmentWaitlistOfferNotifyResult & { skipped?: boolean },
): boolean {
  if (notify.skipped) return false;
  return notify.emailSent || notify.smsSent;
}

/** Custom event dispatched after an appointment cancel frees a slot (staff_choose banner refresh). */
export const WAITLIST_ALERTS_REFRESH_EVENT = 'waitlist-alerts-refresh';

const WAITLIST_ALERTS_REFRESH_RETRY_MS = [0, 500, 1500, 3000] as const;

let scheduledRefreshTimeouts: number[] = [];

export function dispatchWaitlistAlertsRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WAITLIST_ALERTS_REFRESH_EVENT));
}

/** Dispatch refresh immediately and retry briefly so the banner catches sync/async server work. */
export function scheduleWaitlistAlertsRefresh(): void {
  if (typeof window === 'undefined') return;
  for (const timeoutId of scheduledRefreshTimeouts) {
    window.clearTimeout(timeoutId);
  }
  scheduledRefreshTimeouts = WAITLIST_ALERTS_REFRESH_RETRY_MS.map((delayMs) =>
    window.setTimeout(() => dispatchWaitlistAlertsRefresh(), delayMs),
  );
}

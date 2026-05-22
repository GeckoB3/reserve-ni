/** Fired when linked-account incoming requests or pending changes are resolved. */
export const LINKED_ACCOUNT_INCOMING_CHANGED_EVENT = 'reserveni:linked-account-incoming-changed';

/** Tell the dashboard banner to refetch `/api/venue/account-links/incoming`. */
export function notifyLinkedAccountIncomingChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LINKED_ACCOUNT_INCOMING_CHANGED_EVENT));
}

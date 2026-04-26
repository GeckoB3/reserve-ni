/** HttpOnly cookie storing active support session id (UUID). */
export const SUPPORT_SESSION_COOKIE_NAME = 'rn_support_session';

/** Support sessions expire after 60 minutes unless extended. */
export const SUPPORT_SESSION_DURATION_MS = 60 * 60 * 1000;

export interface SupportSessionRow {
  id: string;
  superuser_id: string;
  superuser_email: string;
  superuser_display_name: string | null;
  venue_id: string;
  apparent_staff_id: string;
  reason: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}

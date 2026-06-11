/** Coalesce burst postgres_changes on venue bookings before refetching list APIs. */
export const REALTIME_BOOKINGS_DEBOUNCE_MS = 2_500;

/**
 * Contacts directory: defer list refetch on venue-wide booking postgres events.
 * Guest rows still refresh immediately on `guests` changes.
 */
export const CONTACTS_BOOKINGS_REFRESH_DEBOUNCE_MS = 60_000;

/**
 * Shared dashboard realtime polling fallback (one timer per venue, tab visible only).
 * Used when the Supabase channel is reconnecting — not the happy path.
 */
export const DASHBOARD_LIVE_POLL_MS = 300_000;

/** Staff waitlist banner poll interval when staff_choose mode may be active. */
export const WAITLIST_ALERTS_POLL_MS = 120_000;

/** Client-side stale window for practitioner roster + appointment services on the calendar. */
export const CALENDAR_CATALOG_STALE_MS = 10 * 60 * 1000;

/**
 * HTTP cache for venue catalog GET routes (practitioners/calendars + appointment services).
 *
 * Must NOT give the browser a fresh window: these rows are edited from the dashboard
 * (rename a calendar, toggle active, reorder, change a booking slug, edit a service) and the
 * client refetches the same URL right after the write. A positive `max-age` made the browser
 * serve the stale cached body for the whole window (up to 5 min), so edits appeared to "lag"
 * everywhere they're shown — and even a forced refetch (calendar Refresh button) couldn't
 * override it. `no-store` keeps reads authoritative; per-venue dashboard traffic is low and the
 * heavy caller already throttles refetches client-side via CALENDAR_CATALOG_STALE_MS.
 */
export const VENUE_CATALOG_CACHE_CONTROL = 'private, no-store';

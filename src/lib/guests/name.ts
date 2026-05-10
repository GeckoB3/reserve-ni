/**
 * Guest display names: persist first_name + last_name; format for UI and comms as "First name Surname".
 */

export type GuestNameFallback = 'guest' | 'walk-in';

/** Trim and collapse internal whitespace; empty -> null */
export function normaliseGuestNamePart(value: string | null | undefined): string | null {
  const t = value?.trim().replace(/\s+/g, ' ');
  return t ? t : null;
}

/**
 * Human-readable display for greetings and labels.
 * Order: "First Last"; single part if only one present; fallback when both absent.
 */
export function formatGuestDisplayName(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  fallback: GuestNameFallback = 'guest',
): string {
  const fn = normaliseGuestNamePart(firstName);
  const ln = normaliseGuestNamePart(lastName);
  if (fn && ln) return `${fn} ${ln}`;
  if (fn) return fn;
  if (ln) return ln;
  return fallback === 'walk-in' ? 'Walk-in' : 'Guest';
}

/**
 * First token + remainder (same semantics as import splitFullName).
 */
export function splitLegacyGuestName(full: string | null | undefined): { first: string; last: string } {
  const t = full?.trim() ?? '';
  if (!t) return { first: '', last: '' };
  const sp = t.indexOf(' ');
  if (sp === -1) return { first: t, last: '' };
  return { first: t.slice(0, sp).trim(), last: t.slice(sp + 1).trim() };
}

/**
 * Per-field merge: use booking snapshot when set, else guest profile.
 * Used so list/comms can show the name captured on the booking while filling gaps from the profile.
 */
export function mergeBookingSnapshotWithGuestProfile(params: {
  booking_guest_first_name: string | null | undefined;
  booking_guest_last_name: string | null | undefined;
  profile_first_name: string | null | undefined;
  profile_last_name: string | null | undefined;
}): { first: string | null; last: string | null } {
  const bf = normaliseGuestNamePart(params.booking_guest_first_name);
  const bl = normaliseGuestNamePart(params.booking_guest_last_name);
  const pf = normaliseGuestNamePart(params.profile_first_name);
  const pl = normaliseGuestNamePart(params.profile_last_name);
  return {
    first: bf ?? pf,
    last: bl ?? pl,
  };
}

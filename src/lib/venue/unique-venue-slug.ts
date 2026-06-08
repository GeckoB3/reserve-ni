/**
 * Booking-page slug uniqueness for onboarding.
 *
 * A business name is turned into a booking-page URL slug (see {@link slugFromBusinessName}).
 * When that slug is already taken by another venue we must NOT block onboarding by asking the
 * user to rename their business — instead we pick the next free variant automatically. The venue
 * can always change the URL later in venue settings.
 */

/** How many numbered suffixes (`base-2` … `base-N`) to try before falling back. */
const DEFAULT_MAX_NUMBERED_SUFFIX = 99;

/**
 * Candidate slug variants for a preferred slug, in priority order:
 *
 *  1. the preferred slug itself (`joes-barbers`)
 *  2. the same slug with hyphens removed — only when the name had more than one word, so this
 *     actually differs from the base (`joes-barbers` → `joesbarbers`)
 *  3. numbered suffixes (`joes-barbers-2`, `joes-barbers-3`, …)
 *
 * The caller checks each against the slugs already in use and takes the first free one.
 */
export function candidateVenueSlugs(
  preferredSlug: string,
  maxNumberedSuffix: number = DEFAULT_MAX_NUMBERED_SUFFIX,
): string[] {
  const base = preferredSlug.trim().toLowerCase();
  if (!base) return [];

  const candidates: string[] = [base];

  const withoutHyphens = base.replace(/-/g, '');
  if (withoutHyphens && withoutHyphens !== base) {
    candidates.push(withoutHyphens);
  }

  for (let n = 2; n <= maxNumberedSuffix; n += 1) {
    candidates.push(`${base}-${n}`);
  }

  return candidates;
}

/**
 * First candidate slug that `isTaken` reports as free, or `null` if every candidate (up to the
 * numbered cap) is taken — callers should then fall back to a guaranteed-unique slug.
 */
export function firstAvailableVenueSlug(
  preferredSlug: string,
  isTaken: (slug: string) => boolean,
  maxNumberedSuffix: number = DEFAULT_MAX_NUMBERED_SUFFIX,
): string | null {
  for (const candidate of candidateVenueSlugs(preferredSlug, maxNumberedSuffix)) {
    if (!isTaken(candidate)) return candidate;
  }
  return null;
}

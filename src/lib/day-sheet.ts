/**
 * Day-sheet helpers: dietary parsing with allergy flagging, period selection.
 */

const ALLERGY_KEYWORDS = /\b(allerg(y|ies|ic)|anaphyla(ctic|xis)|intoleran(t|ce)|coeliac|celiac|nut|peanut|tree\s*nut|gluten|dairy|shellfish|egg\s*free)\b/i;

/** Keyword → display label, icon, and allergy flag. */
const DIETARY_KEYWORDS: Array<{ pattern: RegExp; label: string; icon: string; isAllergy: boolean }> = [
  { pattern: /\b(gluten[- ]?free|coeliac|celiac)\b/i, label: 'Gluten Free', icon: '🌾', isAllergy: true },
  { pattern: /\b(vegetarian|vegan|veg)\b/i, label: 'Vegetarian/Vegan', icon: '🌱', isAllergy: false },
  { pattern: /\b(nut|peanut|tree nut|nuts)\s*(allergy|free)?\b/i, label: 'Nut Allergy', icon: '🥜', isAllergy: true },
  { pattern: /\b(dairy[- ]?free|lactose)\b/i, label: 'Dairy Free', icon: '🥛', isAllergy: true },
  { pattern: /\b(shellfish)\b/i, label: 'Shellfish Allergy', icon: '🦐', isAllergy: true },
  { pattern: /\b(halal)\b/i, label: 'Halal', icon: '☪', isAllergy: false },
  { pattern: /\b(kosher)\b/i, label: 'Kosher', icon: '✡', isAllergy: false },
  { pattern: /\b(celebration|birthday|anniversary|occasion)\b/i, label: 'Celebration', icon: '🎂', isAllergy: false },
  { pattern: /\b(allerg(y|ies)|allergic|anaphyla(ctic|xis)|intoleran(t|ce))\b/i, label: 'Allergies', icon: '⚠️', isAllergy: true },
];

export interface DietaryTag {
  label: string;
  icon: string;
  isAllergy: boolean;
}

/**
 * Parse dietary_notes, special_requests, and occasion into tags with labels, icons, and allergy flags.
 * Allergy-flagged tags require visual distinction (red warning) in the UI.
 */
export function parseDietaryNotes(
  dietaryNotes: string | null,
  occasion: string | null,
  specialRequests?: string | null,
): DietaryTag[] {
  const text = [dietaryNotes, specialRequests, occasion].filter(Boolean).join(' ').trim();
  if (!text) return [];
  const seen = new Set<string>();
  const tags: DietaryTag[] = [];
  for (const { pattern, label, icon, isAllergy } of DIETARY_KEYWORDS) {
    if (pattern.test(text) && !seen.has(label)) {
      seen.add(label);
      tags.push({ label, icon, isAllergy });
    }
  }
  return tags;
}

/** Quick check: does the combined text contain any allergy-related keywords? */
export function hasAllergyKeywords(text: string): boolean {
  return ALLERGY_KEYWORDS.test(text);
}

/** Group and count dietary requirements from multiple bookings. Returns e.g. [{ label: 'Gluten Free', count: 3, isAllergy: true }]. */
export function dietarySummary(
  bookings: Array<{ dietary_notes: string | null; occasion: string | null; special_requests?: string | null }>
): Array<{ label: string; count: number; isAllergy: boolean }> {
  const counts: Record<string, { count: number; isAllergy: boolean }> = {};
  for (const b of bookings) {
    const tags = parseDietaryNotes(b.dietary_notes, b.occasion, b.special_requests);
    for (const { label, isAllergy } of tags) {
      if (!counts[label]) counts[label] = { count: 0, isAllergy };
      counts[label]!.count += 1;
    }
  }
  return Object.entries(counts)
    .map(([label, { count, isAllergy }]) => ({ label, count, isAllergy }))
    .sort((a, b) => b.count - a.count);
}

/** Get current time in venue timezone as date (YYYY-MM-DD) and minutes since midnight. */
export function nowInVenueTz(timezone: string): { dateStr: string; minutesSinceMidnight: number } {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '0';
  const dateStr = `${get('year')}-${get('month')}-${get('day')}`;
  const hours = parseInt(get('hour'), 10);
  const minutes = parseInt(get('minute'), 10);
  return { dateStr, minutesSinceMidnight: hours * 60 + minutes };
}

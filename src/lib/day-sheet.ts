/**
 * Day-sheet helpers: dietary parsing, period selection.
 */

/** Keyword → display label and icon. */
const DIETARY_KEYWORDS: Array<{ pattern: RegExp; label: string; icon: string }> = [
  { pattern: /\b(gluten[- ]?free|coeliac|celiac)\b/i, label: 'Gluten Free', icon: '🌾' },
  { pattern: /\b(vegetarian|vegan|veg)\b/i, label: 'Vegetarian/Vegan', icon: '🌱' },
  { pattern: /\b(nut|peanut|tree nut|nuts)\s*(allergy|free)?\b/i, label: 'Nut Allergy', icon: '🥜' },
  { pattern: /\b(dairy[- ]?free|lactose)\b/i, label: 'Dairy Free', icon: '🥛' },
  { pattern: /\b(halal)\b/i, label: 'Halal', icon: '☪' },
  { pattern: /\b(kosher)\b/i, label: 'Kosher', icon: '✡' },
  { pattern: /\b(celebration|birthday|anniversary|occasion)\b/i, label: 'Celebration', icon: '🎂' },
  { pattern: /\b(allerg(y|ies)|allergic)\b/i, label: 'Allergies', icon: '⚠️' },
];

export interface DietaryTag {
  label: string;
  icon: string;
}

/** Parse dietary_notes (and occasion) into tags with labels and icons. */
export function parseDietaryNotes(dietaryNotes: string | null, occasion: string | null): DietaryTag[] {
  const text = [dietaryNotes, occasion].filter(Boolean).join(' ').trim();
  if (!text) return [];
  const seen = new Set<string>();
  const tags: DietaryTag[] = [];
  for (const { pattern, label, icon } of DIETARY_KEYWORDS) {
    if (pattern.test(text) && !seen.has(label)) {
      seen.add(label);
      tags.push({ label, icon });
    }
  }
  return tags;
}

/** Group and count dietary requirements from multiple bookings. Returns e.g. [{ label: 'Gluten Free', count: 3 }]. */
export function dietarySummary(
  bookings: Array<{ dietary_notes: string | null; occasion: string | null }>
): Array<{ label: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const b of bookings) {
    const tags = parseDietaryNotes(b.dietary_notes, b.occasion);
    for (const { label } of tags) {
      counts[label] = (counts[label] ?? 0) + 1;
    }
  }
  return Object.entries(counts)
    .map(([label, count]) => ({ label, count }))
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

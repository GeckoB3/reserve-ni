/**
 * Lightweight fuzzy name matching for import reference resolution.
 *
 * Used to (a) auto-resolve references that are near-certain matches without any
 * AI call, and (b) rank candidate shortlists for the AI prompt. Deterministic
 * and dependency-free: normalised exact / containment checks plus a Sørensen–
 * Dice bigram similarity.
 */

export function normalizeNameForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip diacritics
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function bigrams(s: string): Map<string, number> {
  const out = new Map<string, number>();
  const t = ` ${s} `;
  for (let i = 0; i < t.length - 1; i += 1) {
    const g = t.slice(i, i + 2);
    out.set(g, (out.get(g) ?? 0) + 1);
  }
  return out;
}

function diceSimilarity(a: string, b: string): number {
  if (!a || !b) return 0;
  const ga = bigrams(a);
  const gb = bigrams(b);
  let overlap = 0;
  let totalA = 0;
  let totalB = 0;
  for (const n of ga.values()) totalA += n;
  for (const n of gb.values()) totalB += n;
  for (const [g, n] of ga) {
    const m = gb.get(g);
    if (m) overlap += Math.min(n, m);
  }
  const denom = totalA + totalB;
  return denom === 0 ? 0 : (2 * overlap) / denom;
}

/**
 * Similarity score in [0, 1]. 1 = normalised-exact. Containment (one name
 * inside the other) floors at 0.85. Otherwise bigram Dice similarity of the
 * normalised strings, blended with token overlap so word reordering scores well.
 */
export function fuzzyNameScore(a: string, b: string): number {
  const na = normalizeNameForMatch(a);
  const nb = normalizeNameForMatch(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;

  const dice = diceSimilarity(na, nb);

  const ta = new Set(na.split(' '));
  const tb = new Set(nb.split(' '));
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared += 1;
  const tokenJaccard = shared / (ta.size + tb.size - shared);

  let score = 0.6 * dice + 0.4 * tokenJaccard;

  if (na.includes(nb) || nb.includes(na)) {
    score = Math.max(score, 0.85);
  }
  return Math.min(1, score);
}

/**
 * Threshold at which a reference can be auto-resolved without asking the user.
 * Normalised-exact and containment matches qualify; loose similarity does not.
 */
export const FUZZY_AUTO_RESOLVE_THRESHOLD = 0.95;

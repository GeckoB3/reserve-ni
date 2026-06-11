import { describe, expect, it } from 'vitest';
import {
  FUZZY_AUTO_RESOLVE_THRESHOLD,
  fuzzyNameScore,
  normalizeNameForMatch,
} from '@/lib/import/fuzzy-match';

describe('normalizeNameForMatch', () => {
  it('lowercases, strips punctuation/diacritics and collapses spaces', () => {
    expect(normalizeNameForMatch("  Men's  Cut & Finish! ")).toBe('men s cut and finish');
    expect(normalizeNameForMatch('Siân Müller')).toBe('sian muller');
  });
});

describe('fuzzyNameScore', () => {
  it('scores normalised-exact matches as 1', () => {
    expect(fuzzyNameScore('Gents Cut', 'gents cut')).toBe(1);
    expect(fuzzyNameScore('Cut & Blow-Dry', 'Cut and Blow Dry')).toBe(1);
  });

  it('scores containment at or above the auto-resolve floor', () => {
    expect(fuzzyNameScore('Jo Smith', 'Jo')).toBeGreaterThanOrEqual(0.85);
  });

  it('ranks similar names above dissimilar ones', () => {
    const close = fuzzyNameScore('Full Head Colour', 'Full Head Color');
    const far = fuzzyNameScore('Full Head Colour', 'Deep Tissue Massage');
    expect(close).toBeGreaterThan(0.7);
    expect(far).toBeLessThan(0.3);
    expect(close).toBeGreaterThan(far);
  });

  it('handles word reordering', () => {
    expect(fuzzyNameScore('Smith, Jo', 'Jo Smith')).toBeGreaterThan(0.8);
  });

  it('only normalised-exact style matches clear the auto-resolve threshold', () => {
    expect(fuzzyNameScore('Gents Cut', 'GENTS CUT')).toBeGreaterThanOrEqual(FUZZY_AUTO_RESOLVE_THRESHOLD);
    expect(fuzzyNameScore('Gents Cut', 'Gents Cut Deluxe')).toBeLessThan(FUZZY_AUTO_RESOLVE_THRESHOLD);
  });
});

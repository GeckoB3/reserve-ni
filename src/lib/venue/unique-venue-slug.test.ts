import { describe, expect, it } from 'vitest';
import { candidateVenueSlugs, firstAvailableVenueSlug } from './unique-venue-slug';

describe('candidateVenueSlugs', () => {
  it('tries the base, then the de-hyphenated form, then numbered suffixes', () => {
    const candidates = candidateVenueSlugs('joes-barbers', 3);
    expect(candidates).toEqual(['joes-barbers', 'joesbarbers', 'joes-barbers-2', 'joes-barbers-3']);
  });

  it('omits the de-hyphenated variant for single-word names', () => {
    const candidates = candidateVenueSlugs('salon', 3);
    // No hyphen to drop, so the second priority is the first numbered suffix.
    expect(candidates).toEqual(['salon', 'salon-2', 'salon-3']);
  });

  it('drops every hyphen for multi-word names', () => {
    expect(candidateVenueSlugs('the-corner-shop', 2)[1]).toBe('thecornershop');
  });

  it('returns nothing for an empty slug', () => {
    expect(candidateVenueSlugs('')).toEqual([]);
  });
});

describe('firstAvailableVenueSlug', () => {
  it('keeps the preferred slug when it is free', () => {
    expect(firstAvailableVenueSlug('joes-barbers', () => false)).toBe('joes-barbers');
  });

  it('drops the hyphen when the base is taken', () => {
    const taken = new Set(['joes-barbers']);
    expect(firstAvailableVenueSlug('joes-barbers', (s) => taken.has(s))).toBe('joesbarbers');
  });

  it('falls back to a numbered suffix when base and de-hyphenated form are taken', () => {
    const taken = new Set(['joes-barbers', 'joesbarbers']);
    expect(firstAvailableVenueSlug('joes-barbers', (s) => taken.has(s))).toBe('joes-barbers-2');
  });

  it('uses the first numbered suffix for a taken single-word name', () => {
    const taken = new Set(['salon']);
    expect(firstAvailableVenueSlug('salon', (s) => taken.has(s))).toBe('salon-2');
  });

  it('skips consecutively taken numbered suffixes', () => {
    const taken = new Set(['salon', 'salon-2', 'salon-3']);
    expect(firstAvailableVenueSlug('salon', (s) => taken.has(s))).toBe('salon-4');
  });

  it('returns null when every candidate up to the cap is taken', () => {
    const taken = new Set(candidateVenueSlugs('salon', 5));
    expect(firstAvailableVenueSlug('salon', (s) => taken.has(s), 5)).toBeNull();
  });
});

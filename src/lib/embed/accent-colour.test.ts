import { describe, expect, it } from 'vitest';
import {
  buildVenueEmbedSnippet,
  embedAccentSearchParam,
  normalizeEmbedAccentHex,
} from '@/lib/embed/accent-colour';

describe('normalizeEmbedAccentHex', () => {
  it('accepts hex with or without hash', () => {
    expect(normalizeEmbedAccentHex('#4F46E5')).toBe('4f46e5');
    expect(normalizeEmbedAccentHex('5c4033')).toBe('5c4033');
  });

  it('rejects invalid values', () => {
    expect(normalizeEmbedAccentHex('')).toBeNull();
    expect(normalizeEmbedAccentHex('abc')).toBeNull();
    expect(normalizeEmbedAccentHex('gggggg')).toBeNull();
  });
});

describe('buildVenueEmbedSnippet', () => {
  it('includes accent query when set', () => {
    const { embedUrl, snippet } = buildVenueEmbedSnippet({
      baseUrl: 'https://app.example.com',
      venueSlug: 'plus-1',
      accentHex: '4F46E5',
    });
    expect(embedUrl).toBe('https://app.example.com/embed/plus-1?accent=4f46e5');
    expect(snippet).toContain('?accent=4f46e5');
    expect(snippet).toContain('resize.js');
  });
});

describe('embedAccentSearchParam', () => {
  it('returns empty string when unset', () => {
    expect(embedAccentSearchParam(null)).toBe('');
  });
});

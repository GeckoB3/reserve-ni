import { describe, expect, it } from 'vitest';
import { normaliseServiceNameForMerge } from './catalogue';

describe('normaliseServiceNameForMerge', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normaliseServiceNameForMerge('  Swedish   Massage ')).toBe('swedish massage');
  });
  it('strips trailing duration tokens', () => {
    expect(normaliseServiceNameForMerge('Swedish Massage 60min')).toBe('swedish massage');
    expect(normaliseServiceNameForMerge('Swedish Massage 1 hour')).toBe('swedish massage');
    expect(normaliseServiceNameForMerge('Deep Tissue 90 minutes')).toBe('deep tissue');
  });
  it('drops parenthetical asides', () => {
    expect(normaliseServiceNameForMerge('Facial (45 mins)')).toBe('facial');
  });
  it('ignores punctuation differences', () => {
    expect(normaliseServiceNameForMerge('Gel-Polish: Hands')).toBe(
      normaliseServiceNameForMerge('Gel Polish Hands'),
    );
  });
  it('normalises diacritics', () => {
    expect(normaliseServiceNameForMerge('Manicüre')).toBe('manicure');
  });
});


import { describe, expect, it } from 'vitest';
import {
  normaliseServiceNameForMerge,
  suggestServiceMerges,
  providerApprovalOnCreate,
  approvalAfterTermsChange,
  type SourceServiceForMerge,
} from './catalogue';

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

describe('suggestServiceMerges', () => {
  const svc = (venueId: string, serviceId: string, name: string): SourceServiceForMerge => ({
    venueId,
    serviceId,
    name,
    durationMinutes: 60,
    pricePence: 5000,
  });

  it('groups same-named services across different venues', () => {
    const suggestions = suggestServiceMerges([
      svc('v1', 's1', 'Swedish Massage'),
      svc('v2', 's2', 'swedish massage 60min'),
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0]!.members).toHaveLength(2);
    expect(suggestions[0]!.canonicalName).toBe('Swedish Massage');
  });

  it('does NOT suggest merging two services within the same venue', () => {
    const suggestions = suggestServiceMerges([
      svc('v1', 's1', 'Swedish Massage'),
      svc('v1', 's2', 'Swedish Massage'),
    ]);
    expect(suggestions).toEqual([]);
  });

  it('does not group genuinely different services', () => {
    const suggestions = suggestServiceMerges([
      svc('v1', 's1', 'Swedish Massage'),
      svc('v2', 's2', 'Hot Stone Therapy'),
    ]);
    expect(suggestions).toEqual([]);
  });

  it('returns suggestions sorted by canonical name', () => {
    const suggestions = suggestServiceMerges([
      svc('v1', 'a1', 'Waxing'),
      svc('v2', 'a2', 'Waxing'),
      svc('v1', 'b1', 'Facial'),
      svc('v2', 'b2', 'Facial'),
    ]);
    expect(suggestions.map((s) => s.canonicalName)).toEqual(['Facial', 'Waxing']);
  });

  it('ignores blank/punctuation-only names', () => {
    expect(suggestServiceMerges([svc('v1', 's1', '!!!'), svc('v2', 's2', '???')])).toEqual([]);
  });
});

describe('providerApprovalOnCreate', () => {
  it('auto-approves a venue curating its own calendar', () => {
    expect(providerApprovalOnCreate('v1', 'v1')).toBe('approved');
  });
  it('leaves another venue’s calendar pending consent', () => {
    expect(providerApprovalOnCreate('host', 'member')).toBe('pending');
  });
});

describe('approvalAfterTermsChange', () => {
  it('approves when the owning venue edits its own terms', () => {
    expect(approvalAfterTermsChange('v1', 'v1', true)).toBe('approved');
    expect(approvalAfterTermsChange('v1', 'v1', false)).toBe('approved');
  });
  it('resets to pending when the host changes another venue’s terms', () => {
    expect(approvalAfterTermsChange('host', 'member', true)).toBe('pending');
  });
  it('leaves approval unchanged when the host edits a member provider without changing terms', () => {
    expect(approvalAfterTermsChange('host', 'member', false)).toBeNull();
  });
});

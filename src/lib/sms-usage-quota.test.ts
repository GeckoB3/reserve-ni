import { describe, expect, it } from 'vitest';
import { wouldExceedSmsQuota } from '@/lib/sms-usage';

describe('wouldExceedSmsQuota', () => {
  it('blocks when allowance is zero', () => {
    expect(wouldExceedSmsQuota(0, 0, 1)).toBe(true);
    expect(wouldExceedSmsQuota(0, 0, 0)).toBe(false);
  });

  it('allows sends under cap', () => {
    expect(wouldExceedSmsQuota(0, 300, 1)).toBe(false);
    expect(wouldExceedSmsQuota(299, 300, 1)).toBe(false);
  });

  it('blocks at cap', () => {
    expect(wouldExceedSmsQuota(300, 300, 1)).toBe(true);
    expect(wouldExceedSmsQuota(800, 800, 1)).toBe(true);
  });
});

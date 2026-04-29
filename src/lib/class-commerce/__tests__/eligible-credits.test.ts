import { describe, it, expect } from 'vitest';
import { creditsProductEligibleForClassType } from '@/lib/class-commerce/available-class-credits';
import { CLASS_ENTITLEMENT_ORDER } from '@/lib/class-commerce/entitlement';

describe('creditsProductEligibleForClassType', () => {
  it('allows all classes when eligible list empty or null', () => {
    expect(creditsProductEligibleForClassType(null, 't1')).toBe(true);
    expect(creditsProductEligibleForClassType(undefined, 't1')).toBe(true);
    expect(creditsProductEligibleForClassType([], 't1')).toBe(true);
  });

  it('requires explicit type when list is set', () => {
    expect(creditsProductEligibleForClassType(['a', 'b'], 'a')).toBe(true);
    expect(creditsProductEligibleForClassType(['a', 'b'], 'c')).toBe(false);
  });
});

describe('CLASS_ENTITLEMENT_ORDER', () => {
  it('lists known precedence keys', () => {
    expect(CLASS_ENTITLEMENT_ORDER).toContain('class_credits');
    expect(CLASS_ENTITLEMENT_ORDER).toContain('course_enrollment');
  });
});

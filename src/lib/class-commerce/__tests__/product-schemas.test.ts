import { describe, expect, it } from 'vitest';
import { classCourseProductBodySchema, parseMembershipRules } from '@/lib/class-commerce/product-schemas';

describe('classCourseProductBodySchema', () => {
  it('rejects active course with no sessions', () => {
    const r = classCourseProductBodySchema.safeParse({
      name: 'Test',
      price_pence: 1000,
      session_instance_ids: [],
      active: true,
    });
    expect(r.success).toBe(false);
  });

  it('accepts draft course with no sessions when inactive', () => {
    const r = classCourseProductBodySchema.safeParse({
      name: 'Test',
      price_pence: 1000,
      session_instance_ids: [],
      active: false,
    });
    expect(r.success).toBe(true);
  });
});

describe('parseMembershipRules', () => {
  it('parses unlimited flag', () => {
    expect(parseMembershipRules({ unlimited: true }).unlimited).toBe(true);
  });
});

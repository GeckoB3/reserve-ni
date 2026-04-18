import { describe, expect, it } from 'vitest';
import { todayIsoLocal } from './normalize';

describe('todayIsoLocal', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayIsoLocal()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

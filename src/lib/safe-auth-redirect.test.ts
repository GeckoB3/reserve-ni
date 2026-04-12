import { describe, expect, it } from 'vitest';
import { sanitizeAuthNextPath } from './safe-auth-redirect';

describe('sanitizeAuthNextPath', () => {
  it('allows internal paths', () => {
    expect(sanitizeAuthNextPath('/dashboard')).toBe('/dashboard');
    expect(sanitizeAuthNextPath('/auth/set-password')).toBe('/auth/set-password');
  });

  it('rejects open redirects', () => {
    expect(sanitizeAuthNextPath('//evil.com')).toBe('/dashboard');
    expect(sanitizeAuthNextPath('https://evil.com')).toBe('/dashboard');
    expect(sanitizeAuthNextPath(null)).toBe('/dashboard');
  });
});

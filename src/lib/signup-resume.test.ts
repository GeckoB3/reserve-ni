import { afterEach, describe, expect, it, vi } from 'vitest';
import { getSignupResumePath } from './signup-resume';

const originalWindow = global.window;

describe('getSignupResumePath', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalWindow === undefined) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (global as any).window;
    } else {
      vi.stubGlobal('window', originalWindow);
    }
  });

  it('returns the business type step on the server', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (global as any).window;
    expect(getSignupResumePath()).toBe('/signup/business-type');
  });

  it('returns payment for appointments plan without a business type', () => {
    const storage = new Map<string, string>([['signup_plan', 'appointments']]);
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
    });

    expect(getSignupResumePath()).toBe('/signup/payment');
  });

  it('returns payment for Appointments Light without a business type', () => {
    const storage = new Map<string, string>([['signup_plan', 'light']]);
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
    });

    expect(getSignupResumePath()).toBe('/signup/payment');
  });

  it('returns payment when business type and plan are both set', () => {
    const storage = new Map<string, string>([
      ['signup_plan', 'restaurant'],
      ['signup_business_type', 'restaurant'],
    ]);
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
    });

    expect(getSignupResumePath()).toBe('/signup/payment');
  });

  it('defaults business type and returns payment when restaurant plan is set without business type', () => {
    const storage = new Map<string, string>([['signup_plan', 'restaurant']]);
    vi.stubGlobal('window', {});
    vi.stubGlobal('sessionStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    });

    expect(getSignupResumePath()).toBe('/signup/payment');
    expect(storage.get('signup_business_type')).toBe('restaurant');
  });
});

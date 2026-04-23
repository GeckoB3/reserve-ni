import { describe, expect, it } from 'vitest';
import { isSignupPaymentReady } from './signup-pending-selection';

describe('isSignupPaymentReady', () => {
  it('is true for appointments and plus without business type', () => {
    expect(isSignupPaymentReady('appointments', null)).toBe(true);
    expect(isSignupPaymentReady('appointments', undefined)).toBe(true);
    expect(isSignupPaymentReady('plus', null)).toBe(true);
  });

  it('is true for light without business type', () => {
    expect(isSignupPaymentReady('light', null)).toBe(true);
  });

  it('requires business type for restaurant and founding', () => {
    expect(isSignupPaymentReady('restaurant', null)).toBe(false);
    expect(isSignupPaymentReady('restaurant', '  ')).toBe(false);
    expect(isSignupPaymentReady('restaurant', 'cafe')).toBe(true);
    expect(isSignupPaymentReady('founding', 'restaurant')).toBe(true);
  });

  it('is false when plan is missing', () => {
    expect(isSignupPaymentReady(null, 'x')).toBe(false);
    expect(isSignupPaymentReady(undefined, null)).toBe(false);
  });
});

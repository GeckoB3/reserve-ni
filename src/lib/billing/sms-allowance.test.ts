import { describe, expect, it } from 'vitest';
import {
  computeSmsMonthlyAllowance,
  SMS_INCLUDED_APPOINTMENTS,
  SMS_INCLUDED_PLUS,
  SMS_INCLUDED_RESTAURANT,
} from './sms-allowance';

describe('computeSmsMonthlyAllowance', () => {
  it('returns 0 for light', () => {
    expect(computeSmsMonthlyAllowance('light', null)).toBe(0);
  });
  it('returns 300 for plus', () => {
    expect(computeSmsMonthlyAllowance('plus', null)).toBe(SMS_INCLUDED_PLUS);
    expect(SMS_INCLUDED_PLUS).toBe(300);
  });
  it('returns 800 for appointments (Pro)', () => {
    expect(computeSmsMonthlyAllowance('appointments', null)).toBe(SMS_INCLUDED_APPOINTMENTS);
    expect(SMS_INCLUDED_APPOINTMENTS).toBe(800);
  });
  it('returns 800 for restaurant and founding', () => {
    expect(computeSmsMonthlyAllowance('restaurant', null)).toBe(SMS_INCLUDED_RESTAURANT);
    expect(computeSmsMonthlyAllowance('founding', null)).toBe(SMS_INCLUDED_RESTAURANT);
  });
});

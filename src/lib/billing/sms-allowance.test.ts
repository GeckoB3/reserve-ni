import { describe, expect, it } from 'vitest';
import {
  computeSmsMonthlyAllowance,
  SMS_INCLUDED_APPOINTMENTS,
  SMS_INCLUDED_LIGHT,
  SMS_INCLUDED_PLUS,
  SMS_INCLUDED_RESTAURANT,
} from './sms-allowance';

describe('computeSmsMonthlyAllowance', () => {
  it('returns 100 for light', () => {
    expect(computeSmsMonthlyAllowance('light', null)).toBe(SMS_INCLUDED_LIGHT);
    expect(SMS_INCLUDED_LIGHT).toBe(100);
  });
  it('returns 300 for plus', () => {
    expect(computeSmsMonthlyAllowance('plus', null)).toBe(SMS_INCLUDED_PLUS);
    expect(SMS_INCLUDED_PLUS).toBe(250);
  });
  it('returns 500 for appointments (Pro)', () => {
    expect(computeSmsMonthlyAllowance('appointments', null)).toBe(SMS_INCLUDED_APPOINTMENTS);
    expect(SMS_INCLUDED_APPOINTMENTS).toBe(500);
  });
  it('returns 500 for restaurant and founding', () => {
    expect(computeSmsMonthlyAllowance('restaurant', null)).toBe(SMS_INCLUDED_RESTAURANT);
    expect(computeSmsMonthlyAllowance('founding', null)).toBe(SMS_INCLUDED_RESTAURANT);
    expect(SMS_INCLUDED_RESTAURANT).toBe(500);
  });
});

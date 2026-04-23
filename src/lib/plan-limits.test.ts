import { describe, expect, it } from 'vitest';
import { planCalendarLimit, planStaffLimit } from './plan-limits';

describe('planCalendarLimit', () => {
  it('returns 1 for light', () => {
    expect(planCalendarLimit('light')).toBe(1);
  });
  it('returns 5 for plus', () => {
    expect(planCalendarLimit('plus')).toBe(5);
  });
  it('returns Infinity for appointments and restaurant', () => {
    expect(planCalendarLimit('appointments')).toBe(Infinity);
    expect(planCalendarLimit('restaurant')).toBe(Infinity);
    expect(planCalendarLimit('founding')).toBe(Infinity);
  });
});

describe('planStaffLimit', () => {
  it('returns 1 for light', () => {
    expect(planStaffLimit('light')).toBe(1);
  });
  it('returns 5 for plus', () => {
    expect(planStaffLimit('plus')).toBe(5);
  });
  it('returns Infinity for other tiers', () => {
    expect(planStaffLimit('appointments')).toBe(Infinity);
  });
});

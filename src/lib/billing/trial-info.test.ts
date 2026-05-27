import { describe, expect, it } from 'vitest';
import { computeTrialBreakdown } from './trial-info';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('computeTrialBreakdown', () => {
  it('marks not trialing when plan_status is not "trialing"', () => {
    const result = computeTrialBreakdown({
      planStatus: 'active',
      subscriptionCurrentPeriodStart: '2026-05-01T00:00:00Z',
      subscriptionCurrentPeriodEnd: '2026-06-01T00:00:00Z',
      referralAttached: false,
      referrerVenueName: null,
    });
    expect(result.isTrialing).toBe(false);
    expect(result.daysRemaining).toBe(0);
  });

  it('14 days standard, no referral', () => {
    const start = '2026-05-01T00:00:00Z';
    const end = '2026-05-15T00:00:00Z';
    const now = new Date('2026-05-08T12:00:00Z'); // 7d in
    const result = computeTrialBreakdown({
      planStatus: 'trialing',
      subscriptionCurrentPeriodStart: start,
      subscriptionCurrentPeriodEnd: end,
      referralAttached: false,
      referrerVenueName: null,
      now,
    });
    expect(result.isTrialing).toBe(true);
    expect(result.standardDays).toBe(14);
    expect(result.referralBonusDays).toBe(0);
    expect(result.totalDays).toBe(14);
    expect(result.daysRemaining).toBe(7);
    expect(result.referrerVenueName).toBe(null);
    expect(result.hasReferralAttached).toBe(false);
  });

  it('14 + 30 days with referral attached', () => {
    const start = '2026-05-01T00:00:00Z';
    const end = '2026-06-14T00:00:00Z'; // 44 days later
    const now = new Date('2026-05-15T12:00:00Z'); // 14.5 days in
    const result = computeTrialBreakdown({
      planStatus: 'trialing',
      subscriptionCurrentPeriodStart: start,
      subscriptionCurrentPeriodEnd: end,
      referralAttached: true,
      referrerVenueName: 'Greenway Salon',
      now,
    });
    expect(result.isTrialing).toBe(true);
    expect(result.standardDays).toBe(14);
    expect(result.referralBonusDays).toBe(30);
    expect(result.totalDays).toBe(44);
    expect(result.daysRemaining).toBe(30); // ~29.5 → ceil = 30
    expect(result.referrerVenueName).toBe('Greenway Salon');
    expect(result.hasReferralAttached).toBe(true);
  });

  it('daysRemaining is 0 when trial end has passed', () => {
    const result = computeTrialBreakdown({
      planStatus: 'trialing',
      subscriptionCurrentPeriodStart: '2026-05-01T00:00:00Z',
      subscriptionCurrentPeriodEnd: '2026-05-15T00:00:00Z',
      referralAttached: false,
      referrerVenueName: null,
      now: new Date('2026-06-01T00:00:00Z'),
    });
    expect(result.daysRemaining).toBe(0);
  });

  it('daysRemaining is 1 on the last day', () => {
    const result = computeTrialBreakdown({
      planStatus: 'trialing',
      subscriptionCurrentPeriodStart: '2026-05-01T00:00:00Z',
      subscriptionCurrentPeriodEnd: '2026-05-15T00:00:00Z',
      referralAttached: false,
      referrerVenueName: null,
      now: new Date(Date.parse('2026-05-15T00:00:00Z') - 12 * 60 * 60 * 1000),
    });
    expect(result.daysRemaining).toBe(1);
  });

  it('uses observed total when larger than the constants (future env bump)', () => {
    // Suppose the trial in Stripe was set to 60 days for some reason.
    const start = '2026-05-01T00:00:00Z';
    const end = new Date(Date.parse(start) + 60 * DAY_MS).toISOString();
    const result = computeTrialBreakdown({
      planStatus: 'trialing',
      subscriptionCurrentPeriodStart: start,
      subscriptionCurrentPeriodEnd: end,
      referralAttached: true,
      referrerVenueName: 'Greenway',
    });
    expect(result.totalDays).toBe(60);
    expect(result.standardDays).toBe(14);
    expect(result.referralBonusDays).toBe(30);
  });

  it('trims and nulls empty referrer name', () => {
    const result = computeTrialBreakdown({
      planStatus: 'trialing',
      subscriptionCurrentPeriodStart: '2026-05-01T00:00:00Z',
      subscriptionCurrentPeriodEnd: '2026-06-14T00:00:00Z',
      referralAttached: true,
      referrerVenueName: '   ',
    });
    expect(result.referrerVenueName).toBe(null);
  });
});

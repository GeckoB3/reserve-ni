import { describe, it, expect } from 'vitest';
import {
  normalizeTimeForDb,
  normalizeTimeToHhMm,
  validateMergedEventTimes,
  validateStartEndTimes,
} from '@/lib/experience-events/experience-event-validation';

describe('experience-event-validation', () => {
  it('validateStartEndTimes rejects end before start', () => {
    expect(validateStartEndTimes('10:00', '09:00')).toBe('End time must be after start time');
    expect(validateStartEndTimes('10:00', '10:00')).toBe('End time must be after start time');
  });

  it('validateStartEndTimes accepts valid range', () => {
    expect(validateStartEndTimes('10:00', '12:00')).toBeNull();
  });

  it('normalizeTimeForDb adds seconds for HH:MM', () => {
    expect(normalizeTimeForDb('09:30')).toBe('09:30:00');
  });

  it('normalizeTimeToHhMm strips seconds from HH:mm:ss', () => {
    expect(normalizeTimeToHhMm('10:30:00')).toBe('10:30');
    expect(normalizeTimeToHhMm(' 09:15:59 ')).toBe('09:15');
    expect(normalizeTimeToHhMm('12:00')).toBe('12:00');
  });

  it('validateMergedEventTimes merges one side from existing row', () => {
    expect(
      validateMergedEventTimes('09:00:00', '11:00:00', { start_time: '10:00' }),
    ).toBeNull();
    expect(
      validateMergedEventTimes('09:00:00', '11:00:00', { end_time: '08:00' }),
    ).toBe('End time must be after start time');
  });
});

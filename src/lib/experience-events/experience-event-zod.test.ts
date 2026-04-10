import { describe, it, expect } from 'vitest';
import {
  formatZodFlattenedError,
  zExperienceEventDescription,
  zExperienceEventHhMm,
} from '@/lib/experience-events/experience-event-zod';

describe('experience-event-zod', () => {
  it('zExperienceEventHhMm accepts HH:mm:ss and normalises', () => {
    expect(zExperienceEventHhMm.parse('14:30:00')).toBe('14:30');
    expect(zExperienceEventHhMm.parse('09:00')).toBe('09:00');
  });

  it('zExperienceEventDescription accepts null from JSON', () => {
    expect(zExperienceEventDescription.parse(null)).toBeUndefined();
    expect(zExperienceEventDescription.parse('Hello')).toBe('Hello');
  });

  it('formatZodFlattenedError formats flatten output', () => {
    expect(
      formatZodFlattenedError({
        formErrors: [],
        fieldErrors: { start_time: ['Invalid'] },
      }),
    ).toBe('start_time: Invalid');
  });
});

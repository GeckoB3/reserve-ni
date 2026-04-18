import { describe, expect, it } from 'vitest';
import { detectPlatform } from '@/lib/import/constants';

describe('detectPlatform', () => {
  it('detects Fresha when enough signature columns match', () => {
    const headers = [
      'Client First Name',
      'Client Last Name',
      'Client Mobile',
      'Client Email',
      'Appointment Date',
      'Appointment Time',
      'Service Name',
      'Staff Member',
    ];
    const { platform } = detectPlatform(headers, 'export.csv');
    expect(platform).toBe('fresha');
  });

  it('returns unknown when few columns match', () => {
    const { platform } = detectPlatform(['A', 'B'], 'x.csv');
    expect(platform).toBe('unknown');
  });
});

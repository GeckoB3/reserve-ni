import { describe, expect, it } from 'vitest';
import {
  formatGuestDisplayName,
  mergeBookingSnapshotWithGuestProfile,
  normaliseGuestNamePart,
  splitLegacyGuestName,
} from '@/lib/guests/name';

describe('normaliseGuestNamePart', () => {
  it('trims and collapses whitespace', () => {
    expect(normaliseGuestNamePart('  Jane \t Doe  ')).toBe('Jane Doe');
  });
  it('returns null for empty input', () => {
    expect(normaliseGuestNamePart('')).toBeNull();
    expect(normaliseGuestNamePart('   ')).toBeNull();
    expect(normaliseGuestNamePart(undefined)).toBeNull();
  });
});

describe('formatGuestDisplayName', () => {
  it('joins first and last with a space', () => {
    expect(formatGuestDisplayName('Jane', 'Doe')).toBe('Jane Doe');
  });
  it('uses a single part when only one is present', () => {
    expect(formatGuestDisplayName('Jane', null)).toBe('Jane');
    expect(formatGuestDisplayName(null, 'Doe')).toBe('Doe');
  });
  it('uses Guest fallback by default when both absent', () => {
    expect(formatGuestDisplayName(null, null)).toBe('Guest');
  });
  it('supports walk-in fallback', () => {
    expect(formatGuestDisplayName(null, null, 'walk-in')).toBe('Walk-in');
  });
});

describe('mergeBookingSnapshotWithGuestProfile', () => {
  it('prefers snapshot parts when present', () => {
    expect(
      mergeBookingSnapshotWithGuestProfile({
        booking_guest_first_name: 'Ann',
        booking_guest_last_name: 'Lee',
        profile_first_name: 'Other',
        profile_last_name: 'Name',
      }),
    ).toEqual({ first: 'Ann', last: 'Lee' });
  });
  it('falls back per field to profile when snapshot part missing', () => {
    expect(
      mergeBookingSnapshotWithGuestProfile({
        booking_guest_first_name: 'Ann',
        booking_guest_last_name: null,
        profile_first_name: 'X',
        profile_last_name: 'Smith',
      }),
    ).toEqual({ first: 'Ann', last: 'Smith' });
  });
});

describe('splitLegacyGuestName', () => {
  it('splits on first space', () => {
    expect(splitLegacyGuestName('Sarah Connor')).toEqual({ first: 'Sarah', last: 'Connor' });
  });
  it('returns whole string as first when single token', () => {
    expect(splitLegacyGuestName('Madonna')).toEqual({ first: 'Madonna', last: '' });
  });
});

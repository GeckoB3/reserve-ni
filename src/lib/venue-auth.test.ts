import { describe, expect, it } from 'vitest';
import type { VenueStaff } from './venue-auth';
import { requireAdmin } from './venue-auth';

function mockStaff(role: 'admin' | 'staff'): VenueStaff {
  return {
    id: 'staff-1',
    venue_id: 'venue-1',
    email: 'user@example.com',
    role,
    db: {} as VenueStaff['db'],
  };
}

describe('requireAdmin', () => {
  it('returns true and narrows role to admin', () => {
    const s = mockStaff('admin');
    expect(requireAdmin(s)).toBe(true);
    if (requireAdmin(s)) {
      expect(s.role).toBe('admin');
    }
  });

  it('returns false for staff role', () => {
    expect(requireAdmin(mockStaff('staff'))).toBe(false);
  });

  it('returns false for null', () => {
    expect(requireAdmin(null)).toBe(false);
  });
});

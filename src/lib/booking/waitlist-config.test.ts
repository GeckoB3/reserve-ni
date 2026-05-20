import { describe, expect, it } from 'vitest';
import { parseWaitlistConfig } from '@/lib/booking/waitlist-config';
import { mergeVenueFeatureFlagsPatch, venueFeatureFlagsForStorage } from '@/lib/feature-flags/resolve';

describe('parseWaitlistConfig', () => {
  it('defaults to notify_in_order when unset', () => {
    expect(parseWaitlistConfig({})).toEqual({ mode: 'notify_in_order' });
    expect(parseWaitlistConfig(null)).toEqual({ mode: 'notify_in_order' });
  });

  it('reads mode from feature flags', () => {
    expect(parseWaitlistConfig({ waitlist_config: { mode: 'staff_choose' } })).toEqual({
      mode: 'staff_choose',
    });
    expect(parseWaitlistConfig({ waitlist_config: { mode: 'notify_all' } })).toEqual({
      mode: 'notify_all',
    });
  });
});

describe('waitlist_config in feature flags storage', () => {
  it('merges and persists waitlist_config', () => {
    const merged = mergeVenueFeatureFlagsPatch(
      { waitlist_v2: true },
      { waitlist_config: { mode: 'notify_all' } },
    );
    expect(merged.waitlist_config).toEqual({ mode: 'notify_all' });

    const stored = venueFeatureFlagsForStorage(merged);
    expect(stored.waitlist_config).toEqual({ mode: 'notify_all' });
  });

  it('clears waitlist_config when waitlist_v2 is turned off', () => {
    const merged = mergeVenueFeatureFlagsPatch(
      { waitlist_v2: true, waitlist_config: { mode: 'staff_choose' } },
      { waitlist_v2: false },
    );
    expect(merged.waitlist_v2).toBeUndefined();
    expect(merged.waitlist_config).toBeUndefined();
  });
});

import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  selectReplacementHost,
  effectiveProviderPricePence,
  effectiveProviderDurationMinutes,
  planProviderStatuses,
  hasFullMutualWriteLinks,
} from './collectives';
import { getAcceptedLinkBetween } from './queries';

vi.mock('./queries', () => ({ getAcceptedLinkBetween: vi.fn() }));
const mockGetLink = vi.mocked(getAcceptedLinkBetween);

/** A minimal accepted-link row builder for the write-gate tests. */
function linkRow(
  overrides: Partial<{
    low_grants_calendar: string;
    high_grants_calendar: string;
    low_grants_act: string;
    high_grants_act: string;
    low_grants_calendar_ids: string[] | null;
    high_grants_calendar_ids: string[] | null;
  }> = {},
) {
  return {
    low_grants_calendar: 'full_details',
    high_grants_calendar: 'full_details',
    low_grants_act: 'create_edit_cancel',
    high_grants_act: 'create_edit_cancel',
    low_grants_calendar_ids: null,
    high_grants_calendar_ids: null,
    ...overrides,
  } as never;
}

describe('selectReplacementHost', () => {
  it('returns null when there are no survivors', () => {
    expect(selectReplacementHost([])).toBeNull();
  });

  it('returns the only survivor', () => {
    expect(
      selectReplacementHost([{ venueId: 'v1', joinedAt: '2026-01-01T00:00:00Z' }]),
    ).toBe('v1');
  });

  it('picks the longest-tenured (earliest joined) survivor', () => {
    const host = selectReplacementHost([
      { venueId: 'late', joinedAt: '2026-03-01T00:00:00Z' },
      { venueId: 'early', joinedAt: '2026-01-01T00:00:00Z' },
      { venueId: 'mid', joinedAt: '2026-02-01T00:00:00Z' },
    ]);
    expect(host).toBe('early');
  });

  it('sorts members with a known joined_at ahead of those without', () => {
    const host = selectReplacementHost([
      { venueId: 'unknown', joinedAt: null },
      { venueId: 'known', joinedAt: '2026-05-01T00:00:00Z' },
    ]);
    expect(host).toBe('known');
  });

  it('treats an unparseable joined_at as longest-ago (sorts last)', () => {
    const host = selectReplacementHost([
      { venueId: 'garbage', joinedAt: 'not-a-date' },
      { venueId: 'real', joinedAt: '2026-05-01T00:00:00Z' },
    ]);
    expect(host).toBe('real');
  });

  it('breaks ties on equal tenure deterministically by venueId', () => {
    const ts = '2026-01-01T00:00:00Z';
    const host = selectReplacementHost([
      { venueId: 'b', joinedAt: ts },
      { venueId: 'a', joinedAt: ts },
      { venueId: 'c', joinedAt: ts },
    ]);
    expect(host).toBe('a');
  });

  it('does not mutate the input array', () => {
    const survivors = [
      { venueId: 'z', joinedAt: '2026-02-01T00:00:00Z' },
      { venueId: 'a', joinedAt: '2026-01-01T00:00:00Z' },
    ];
    const snapshot = survivors.map((s) => s.venueId);
    selectReplacementHost(survivors);
    expect(survivors.map((s) => s.venueId)).toEqual(snapshot);
  });
});

describe('effectiveProviderPricePence', () => {
  it('prefers the provider override', () => {
    expect(
      effectiveProviderPricePence({ default_price_pence: 5000 }, { price_pence_override: 4500 }, 6000),
    ).toBe(4500);
  });
  it('falls back to the item default when there is no override', () => {
    expect(
      effectiveProviderPricePence({ default_price_pence: 5000 }, { price_pence_override: null }, 6000),
    ).toBe(5000);
  });
  it('falls back to the source price when neither override nor item default is set', () => {
    expect(
      effectiveProviderPricePence({ default_price_pence: null }, { price_pence_override: null }, 6000),
    ).toBe(6000);
  });
  it('returns null when nothing is priced', () => {
    expect(
      effectiveProviderPricePence({ default_price_pence: null }, { price_pence_override: null }, null),
    ).toBeNull();
  });
  it('treats a zero override as an explicit free price (not a fallback)', () => {
    expect(
      effectiveProviderPricePence({ default_price_pence: 5000 }, { price_pence_override: 0 }, 6000),
    ).toBe(0);
  });
});

describe('effectiveProviderDurationMinutes', () => {
  it('prefers override, then item default, then source', () => {
    expect(
      effectiveProviderDurationMinutes({ default_duration_minutes: 60 }, { duration_minutes_override: 45 }, 30),
    ).toBe(45);
    expect(
      effectiveProviderDurationMinutes({ default_duration_minutes: 60 }, { duration_minutes_override: null }, 30),
    ).toBe(60);
    expect(
      effectiveProviderDurationMinutes({ default_duration_minutes: null }, { duration_minutes_override: null }, 30),
    ).toBe(30);
    expect(
      effectiveProviderDurationMinutes({ default_duration_minutes: null }, { duration_minutes_override: null }, null),
    ).toBeNull();
  });
});

describe('planProviderStatuses', () => {
  it('removes providers whose venue was removed from the collective', () => {
    const changes = planProviderStatuses(
      [{ id: 'p1', venueId: 'gone', status: 'active' }],
      ['gone'],
      {},
    );
    expect(changes).toEqual([{ id: 'p1', status: 'removed' }]);
  });

  it('suspends providers of a member that lost full mutual write', () => {
    const changes = planProviderStatuses(
      [{ id: 'p1', venueId: 'v1', status: 'active' }],
      [],
      { v1: false },
    );
    expect(changes).toEqual([{ id: 'p1', status: 'suspended' }]);
  });

  it('reactivates a suspended provider once write is restored', () => {
    const changes = planProviderStatuses(
      [{ id: 'p1', venueId: 'v1', status: 'suspended' }],
      [],
      { v1: true },
    );
    expect(changes).toEqual([{ id: 'p1', status: 'active' }]);
  });

  it('omits providers whose status is unchanged', () => {
    const changes = planProviderStatuses(
      [
        { id: 'p1', venueId: 'v1', status: 'active' },
        { id: 'p2', venueId: 'v2', status: 'suspended' },
      ],
      [],
      { v1: true, v2: false },
    );
    expect(changes).toEqual([]);
  });

  it('never resurrects an already-removed provider', () => {
    const changes = planProviderStatuses(
      [{ id: 'p1', venueId: 'v1', status: 'removed' }],
      [],
      { v1: true },
    );
    expect(changes).toEqual([]);
  });
});

describe('hasFullMutualWriteLinks', () => {
  const admin = {} as never;
  beforeEach(() => mockGetLink.mockReset());

  it('is true when every pair holds full mutual create_edit_cancel, unscoped', async () => {
    mockGetLink.mockResolvedValue(linkRow());
    await expect(hasFullMutualWriteLinks(admin, 'v1', ['v2', 'v3'])).resolves.toBe(true);
  });

  it('is false when a link is missing', async () => {
    mockGetLink.mockResolvedValue(null);
    await expect(hasFullMutualWriteLinks(admin, 'v1', ['v2'])).resolves.toBe(false);
  });

  it('is false when one direction is only edit_existing', async () => {
    mockGetLink.mockResolvedValue(linkRow({ high_grants_act: 'edit_existing' }));
    await expect(hasFullMutualWriteLinks(admin, 'v1', ['v2'])).resolves.toBe(false);
  });

  it('is false when calendar visibility is not full_details both ways', async () => {
    mockGetLink.mockResolvedValue(linkRow({ low_grants_calendar: 'time_only' }));
    await expect(hasFullMutualWriteLinks(admin, 'v1', ['v2'])).resolves.toBe(false);
  });

  it('is false when the write grant is §18-scoped to specific calendars', async () => {
    mockGetLink.mockResolvedValue(linkRow({ low_grants_calendar_ids: ['cal-1'] }));
    await expect(hasFullMutualWriteLinks(admin, 'v1', ['v2'])).resolves.toBe(false);
  });

  it('skips the caller venue id in the list', async () => {
    mockGetLink.mockResolvedValue(linkRow());
    await hasFullMutualWriteLinks(admin, 'v1', ['v1', 'v2']);
    expect(mockGetLink).toHaveBeenCalledTimes(1);
  });
});

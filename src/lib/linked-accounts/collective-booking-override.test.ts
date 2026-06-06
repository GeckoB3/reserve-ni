import { describe, expect, it } from 'vitest';
import { resolveCollectiveServiceOverride } from './collective-booking-override';

/**
 * A tiny chainable Supabase stub: each .from(table) returns a builder whose
 * terminal `.maybeSingle()` / awaited result yields the queued row(s) for that
 * table. Enough to exercise the resolver's branch logic without a database.
 */
function makeAdmin(tables: Record<string, unknown>) {
  return {
    from(table: string) {
      const result = tables[table];
      const builder: Record<string, unknown> = {};
      const chain = () => builder;
      for (const m of ['select', 'eq', 'in', 'order', 'neq']) builder[m] = chain;
      builder.maybeSingle = async () => ({ data: Array.isArray(result) ? (result[0] ?? null) : result ?? null });
      builder.then = (resolve: (v: unknown) => unknown) =>
        resolve({ data: Array.isArray(result) ? result : result == null ? [] : [result] });
      return builder;
    },
  } as never;
}

const baseParams = {
  collectiveId: 'col-1',
  collectiveServiceItemId: 'item-1',
  venueId: 'venue-1',
  sourceServiceId: 'svc-1',
  practitionerId: null as string | null,
};

describe('resolveCollectiveServiceOverride', () => {
  it('returns null when no collective/item id is supplied', async () => {
    const admin = makeAdmin({});
    await expect(
      resolveCollectiveServiceOverride(admin, { ...baseParams, collectiveServiceItemId: null }),
    ).resolves.toBeNull();
  });

  it('returns null when the item is not part of a live unified collective', async () => {
    const admin = makeAdmin({ collective_service_items: null });
    await expect(resolveCollectiveServiceOverride(admin, baseParams)).resolves.toBeNull();
  });

  it('returns null when the venue is not an active member', async () => {
    const admin = makeAdmin({
      collective_service_items: { id: 'item-1', collective_id: 'col-1', default_price_pence: null, default_duration_minutes: null, status: 'active' },
      venue_collectives: { id: 'col-1', status: 'active', page_mode: 'unified_catalog' },
      venue_collective_members: null,
    });
    await expect(resolveCollectiveServiceOverride(admin, baseParams)).resolves.toBeNull();
  });

  it('returns null when there is no approved provider for the service', async () => {
    const admin = makeAdmin({
      collective_service_items: { id: 'item-1', collective_id: 'col-1', default_price_pence: null, default_duration_minutes: null, status: 'active' },
      venue_collectives: { id: 'col-1', status: 'active', page_mode: 'unified_catalog' },
      venue_collective_members: { id: 'mem-1' },
      collective_service_providers: [],
    });
    await expect(resolveCollectiveServiceOverride(admin, baseParams)).resolves.toBeNull();
  });

  it('resolves effective price/duration from the provider override', async () => {
    const admin = makeAdmin({
      collective_service_items: { id: 'item-1', collective_id: 'col-1', default_price_pence: 6000, default_duration_minutes: 50, status: 'active' },
      venue_collectives: { id: 'col-1', status: 'active', page_mode: 'unified_catalog' },
      venue_collective_members: { id: 'mem-1' },
      collective_service_providers: [
        { id: 'prov-1', practitioner_id: null, price_pence_override: 4500, duration_minutes_override: 60 },
      ],
      appointment_services: { price_pence: 7000, duration_minutes: 45 },
    });
    await expect(resolveCollectiveServiceOverride(admin, baseParams)).resolves.toEqual({
      collectiveServiceItemId: 'item-1',
      pricePence: 4500,
      durationMinutes: 60,
    });
  });

  it('falls back to item default then source when no provider override is set', async () => {
    const admin = makeAdmin({
      collective_service_items: { id: 'item-1', collective_id: 'col-1', default_price_pence: 6000, default_duration_minutes: null, status: 'active' },
      venue_collectives: { id: 'col-1', status: 'active', page_mode: 'unified_catalog' },
      venue_collective_members: { id: 'mem-1' },
      collective_service_providers: [
        { id: 'prov-1', practitioner_id: null, price_pence_override: null, duration_minutes_override: null },
      ],
      appointment_services: { price_pence: 7000, duration_minutes: 45 },
    });
    await expect(resolveCollectiveServiceOverride(admin, baseParams)).resolves.toEqual({
      collectiveServiceItemId: 'item-1',
      pricePence: 6000, // item default
      durationMinutes: 45, // source (no item default duration)
    });
  });

  it('prefers a practitioner-pinned provider over a venue-wide one', async () => {
    const admin = makeAdmin({
      collective_service_items: { id: 'item-1', collective_id: 'col-1', default_price_pence: null, default_duration_minutes: null, status: 'active' },
      venue_collectives: { id: 'col-1', status: 'active', page_mode: 'unified_catalog' },
      venue_collective_members: { id: 'mem-1' },
      collective_service_providers: [
        { id: 'all', practitioner_id: null, price_pence_override: 5000, duration_minutes_override: 50 },
        { id: 'pinned', practitioner_id: 'pr-9', price_pence_override: 4000, duration_minutes_override: 40 },
      ],
      appointment_services: { price_pence: 9000, duration_minutes: 90 },
    });
    const out = await resolveCollectiveServiceOverride(admin, { ...baseParams, practitionerId: 'pr-9' });
    expect(out?.pricePence).toBe(4000);
    expect(out?.durationMinutes).toBe(40);
  });
});

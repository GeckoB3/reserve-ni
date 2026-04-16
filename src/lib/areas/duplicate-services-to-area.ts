import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Clone all `venue_services` rows from `fromAreaId` into `toAreaId`, including
 * `service_capacity_rules`, `party_size_durations`, and `booking_restrictions`.
 */
export async function duplicateVenueServicesToArea(
  admin: SupabaseClient,
  venueId: string,
  fromAreaId: string,
  toAreaId: string,
): Promise<void> {
  const { data: services, error: svcErr } = await admin
    .from('venue_services')
    .select('*')
    .eq('venue_id', venueId)
    .eq('area_id', fromAreaId)
    .order('sort_order');

  if (svcErr) {
    console.error('duplicateVenueServicesToArea: load services', svcErr.message);
    throw new Error('Failed to load services to copy');
  }

  for (const svc of services ?? []) {
    const row = svc as Record<string, unknown>;
    const {
      id: oldId,
      created_at: _c,
      updated_at: _u,
      ...insertable
    } = row;

    const { data: inserted, error: insErr } = await admin
      .from('venue_services')
      .insert({
        ...insertable,
        venue_id: venueId,
        area_id: toAreaId,
      })
      .select('id')
      .single();

    if (insErr || !inserted) {
      console.error('duplicateVenueServicesToArea: insert service', insErr?.message);
      throw new Error('Failed to copy dining service');
    }

    const newId = (inserted as { id: string }).id;

    const [rulesRes, durRes, restrRes] = await Promise.all([
      admin.from('service_capacity_rules').select('*').eq('service_id', oldId as string),
      admin.from('party_size_durations').select('*').eq('service_id', oldId as string),
      admin.from('booking_restrictions').select('*').eq('service_id', oldId as string),
    ]);

    for (const r of rulesRes.data ?? []) {
      const { id: _i, ...rest } = r as Record<string, unknown>;
      await admin.from('service_capacity_rules').insert({ ...rest, service_id: newId });
    }
    for (const r of durRes.data ?? []) {
      const { id: _i, ...rest } = r as Record<string, unknown>;
      await admin.from('party_size_durations').insert({ ...rest, service_id: newId });
    }
    for (const r of restrRes.data ?? []) {
      const { id: _i, ...rest } = r as Record<string, unknown>;
      await admin.from('booking_restrictions').insert({ ...rest, service_id: newId });
    }
  }
}

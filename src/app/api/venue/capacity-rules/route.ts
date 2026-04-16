import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const ruleSchema = z.object({
  service_id: z.string().uuid(),
  max_covers_per_slot: z.number().int().min(1).max(500),
  max_bookings_per_slot: z.number().int().min(1).max(200),
  slot_interval_minutes: z.number().int().min(5).max(120),
  buffer_minutes: z.number().int().min(0).max(120),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
  time_range_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  time_range_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
});

async function verifyServiceOwnership(admin: ReturnType<typeof getSupabaseAdminClient>, serviceId: string, venueId: string): Promise<boolean> {
  const { count } = await admin.from('venue_services').select('id', { count: 'exact', head: true }).eq('id', serviceId).eq('venue_id', venueId);
  return (count ?? 0) > 0;
}

async function verifyRuleOwnership(admin: ReturnType<typeof getSupabaseAdminClient>, ruleId: string, venueId: string): Promise<boolean> {
  const { data: rule } = await admin
    .from('service_capacity_rules')
    .select('service_id')
    .eq('id', ruleId)
    .maybeSingle();
  if (!rule?.service_id) return false;
  return verifyServiceOwnership(admin, rule.service_id, venueId);
}

/** GET /api/venue/capacity-rules - list capacity rules; optional `area_id` scopes to one dining area. */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const areaId = request.nextUrl.searchParams.get('area_id');

    const admin = getSupabaseAdminClient();
    let svcQ = admin.from('venue_services').select('id').eq('venue_id', staff.venue_id);
    if (areaId) {
      svcQ = svcQ.eq('area_id', areaId);
    }
    const { data: services } = await svcQ;
    const serviceIds = (services ?? []).map((s) => s.id);

    if (serviceIds.length === 0) return NextResponse.json({ rules: [] });

    const { data, error } = await admin
      .from('service_capacity_rules')
      .select('*')
      .in('service_id', serviceIds);

    if (error) {
      console.error('GET /api/venue/capacity-rules failed:', error);
      return NextResponse.json({ error: 'Failed to fetch rules' }, { status: 500 });
    }

    return NextResponse.json({ rules: data });
  } catch (err) {
    console.error('GET /api/venue/capacity-rules failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/capacity-rules - create a capacity rule (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = ruleSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    if (!(await verifyServiceOwnership(admin, parsed.data.service_id, staff.venue_id))) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }

    const { data, error } = await admin
      .from('service_capacity_rules')
      .insert(parsed.data)
      .select('*')
      .single();

    if (error) {
      console.error('POST /api/venue/capacity-rules failed:', error);
      return NextResponse.json({ error: 'Failed to create rule' }, { status: 500 });
    }

    return NextResponse.json({ rule: data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/capacity-rules failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/capacity-rules - update a rule (admin only). Body must include `id`. */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'Missing rule id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    if (!(await verifyRuleOwnership(admin, id, staff.venue_id))) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    const { data, error } = await admin
      .from('service_capacity_rules')
      .update(fields)
      .eq('id', id)
      .select('*')
      .single();

    if (error) {
      console.error('PATCH /api/venue/capacity-rules failed:', error);
      return NextResponse.json({ error: 'Failed to update rule' }, { status: 500 });
    }

    return NextResponse.json({ rule: data });
  } catch (err) {
    console.error('PATCH /api/venue/capacity-rules failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/capacity-rules - delete a rule (admin only). Body must include `id`. */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Missing rule id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    if (!(await verifyRuleOwnership(admin, body.id, staff.venue_id))) {
      return NextResponse.json({ error: 'Rule not found' }, { status: 404 });
    }
    const { error } = await admin.from('service_capacity_rules').delete().eq('id', body.id);

    if (error) {
      console.error('DELETE /api/venue/capacity-rules failed:', error);
      return NextResponse.json({ error: 'Failed to delete rule' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/capacity-rules failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

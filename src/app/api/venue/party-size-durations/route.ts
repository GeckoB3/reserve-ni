import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const durationSchema = z.object({
  service_id: z.string().uuid(),
  min_party_size: z.number().int().min(1),
  max_party_size: z.number().int().min(1),
  duration_minutes: z.number().int().min(15).max(480),
  day_of_week: z.number().int().min(0).max(6).nullable().optional(),
});

async function verifyServiceOwnership(admin: ReturnType<typeof getSupabaseAdminClient>, serviceId: string, venueId: string): Promise<boolean> {
  const { count } = await admin
    .from('venue_services')
    .select('id', { count: 'exact', head: true })
    .eq('id', serviceId)
    .eq('venue_id', venueId);
  return (count ?? 0) > 0;
}

async function verifyDurationOwnership(admin: ReturnType<typeof getSupabaseAdminClient>, durationId: string, venueId: string): Promise<boolean> {
  const { data: duration } = await admin
    .from('party_size_durations')
    .select('service_id')
    .eq('id', durationId)
    .maybeSingle();
  if (!duration?.service_id) return false;
  return verifyServiceOwnership(admin, duration.service_id, venueId);
}

/** GET /api/venue/party-size-durations — optional `area_id` scopes to one dining area. */
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
    if (serviceIds.length === 0) return NextResponse.json({ durations: [] });

    const { data, error } = await admin.from('party_size_durations').select('*').in('service_id', serviceIds);
    if (error) {
      console.error('GET /api/venue/party-size-durations failed:', error);
      return NextResponse.json({ error: 'Failed to fetch durations' }, { status: 500 });
    }

    return NextResponse.json({ durations: data });
  } catch (err) {
    console.error('GET /api/venue/party-size-durations failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/party-size-durations */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = durationSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    if (!(await verifyServiceOwnership(admin, parsed.data.service_id, staff.venue_id))) {
      return NextResponse.json({ error: 'Service not found' }, { status: 404 });
    }
    const { data, error } = await admin.from('party_size_durations').insert(parsed.data).select('*').single();
    if (error) {
      console.error('POST /api/venue/party-size-durations failed:', error);
      return NextResponse.json({ error: 'Failed to create duration' }, { status: 500 });
    }

    return NextResponse.json({ duration: data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/party-size-durations failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/party-size-durations */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    if (!(await verifyDurationOwnership(admin, id, staff.venue_id))) {
      return NextResponse.json({ error: 'Duration not found' }, { status: 404 });
    }
    const { data, error } = await admin.from('party_size_durations').update(fields).eq('id', id).select('*').single();
    if (error) {
      console.error('PATCH /api/venue/party-size-durations failed:', error);
      return NextResponse.json({ error: 'Failed to update duration' }, { status: 500 });
    }

    return NextResponse.json({ duration: data });
  } catch (err) {
    console.error('PATCH /api/venue/party-size-durations failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/party-size-durations */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    if (!(await verifyDurationOwnership(admin, body.id, staff.venue_id))) {
      return NextResponse.json({ error: 'Duration not found' }, { status: 404 });
    }
    const { error } = await admin.from('party_size_durations').delete().eq('id', body.id);
    if (error) {
      console.error('DELETE /api/venue/party-size-durations failed:', error);
      return NextResponse.json({ error: 'Failed to delete duration' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/party-size-durations failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

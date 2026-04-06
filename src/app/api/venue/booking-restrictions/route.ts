import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const restrictionSchema = z.object({
  service_id: z.string().uuid(),
  min_advance_minutes: z.number().int().min(0),
  max_advance_days: z.number().int().min(1).max(365),
  min_party_size_online: z.number().int().min(1),
  max_party_size_online: z.number().int().min(1),
  large_party_threshold: z.number().int().min(1).nullable().optional(),
  large_party_message: z.string().max(500).nullable().optional(),
  deposit_required_from_party_size: z.number().int().min(1).nullable().optional(),
  /** Table reservation: hours before start for deposit refund for this dining service. */
  cancellation_notice_hours: z.number().int().min(0).max(168).optional(),
});

const restrictionPatchSchema = restrictionSchema.partial().extend({
  id: z.string().uuid(),
});

/** GET /api/venue/booking-restrictions */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data: services } = await admin.from('venue_services').select('id').eq('venue_id', staff.venue_id);
    const serviceIds = (services ?? []).map((s) => s.id);
    if (serviceIds.length === 0) return NextResponse.json({ restrictions: [] });

    const { data, error } = await admin.from('booking_restrictions').select('*').in('service_id', serviceIds);
    if (error) {
      console.error('GET /api/venue/booking-restrictions failed:', error);
      return NextResponse.json({ error: 'Failed to fetch restrictions' }, { status: 500 });
    }

    return NextResponse.json({ restrictions: data });
  } catch (err) {
    console.error('GET /api/venue/booking-restrictions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/booking-restrictions */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = restrictionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data: svcRow } = await admin
      .from('venue_services')
      .select('id')
      .eq('id', parsed.data.service_id)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();
    if (!svcRow) {
      return NextResponse.json({ error: 'Service not found for this venue' }, { status: 400 });
    }

    const { data, error } = await admin.from('booking_restrictions').insert(parsed.data).select('*').single();
    if (error) {
      console.error('POST /api/venue/booking-restrictions failed:', error);
      return NextResponse.json({ error: 'Failed to create restriction' }, { status: 500 });
    }

    return NextResponse.json({ restriction: data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/booking-restrictions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/booking-restrictions */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = restrictionPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }
    const { id, ...fields } = parsed.data;

    const admin = getSupabaseAdminClient();
    const { data: existing } = await admin.from('booking_restrictions').select('id, service_id').eq('id', id).maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: 'Restriction not found' }, { status: 404 });
    }
    const svcId = (existing as { service_id: string }).service_id;
    const { data: svc } = await admin.from('venue_services').select('id').eq('id', svcId).eq('venue_id', staff.venue_id).maybeSingle();
    if (!svc) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const { data, error } = await admin.from('booking_restrictions').update(fields).eq('id', id).select('*').single();
    if (error) {
      console.error('PATCH /api/venue/booking-restrictions failed:', error);
      return NextResponse.json({ error: 'Failed to update restriction' }, { status: 500 });
    }

    return NextResponse.json({ restriction: data });
  } catch (err) {
    console.error('PATCH /api/venue/booking-restrictions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/booking-restrictions */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { error } = await admin.from('booking_restrictions').delete().eq('id', body.id);
    if (error) {
      console.error('DELETE /api/venue/booking-restrictions failed:', error);
      return NextResponse.json({ error: 'Failed to delete restriction' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/booking-restrictions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

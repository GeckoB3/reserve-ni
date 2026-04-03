import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { checkCalendarLimit } from '@/lib/tier-enforcement';
import { requireVenueExposesSecondaryModel } from '@/lib/booking/require-venue-secondary-model';
import { z } from 'zod';

const availabilityExceptionDaySchema = z.union([
  z.object({ closed: z.literal(true) }),
  z.object({
    periods: z.array(z.object({ start: z.string(), end: z.string() })).min(1),
  }),
]);

const resourceSchema = z.object({
  name: z.string().min(1).max(200),
  resource_type: z.string().max(100).optional(),
  min_booking_minutes: z.number().int().min(15).max(480).optional(),
  max_booking_minutes: z.number().int().min(15).max(1440).optional(),
  slot_interval_minutes: z.number().int().min(5).max(120).optional(),
  price_per_slot_pence: z.number().int().min(0).optional(),
  availability_hours: z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }))).optional(),
  availability_exceptions: z
    .record(z.string().regex(/^\d{4}-\d{2}-\d{2}$/), availabilityExceptionDaySchema)
    .optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

/** GET /api/venue/resources - list resources for the venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('venue_resources')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('GET /api/venue/resources failed:', error);
      return NextResponse.json({ error: 'Failed to fetch resources' }, { status: 500 });
    }

    return NextResponse.json({ resources: data });
  } catch (err) {
    console.error('GET /api/venue/resources failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/resources - create a resource (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'resource_booking');
    if (!modelGate.ok) return modelGate.response;

    const body = await request.json();
    const parsed = resourceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const limitCheck = await checkCalendarLimit(staff.venue_id, 'venue_resources');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: 'Calendar limit reached', current: limitCheck.current, limit: limitCheck.limit, upgrade_required: true },
        { status: 403 }
      );
    }

    const { data, error } = await admin
      .from('venue_resources')
      .insert({
        venue_id: staff.venue_id,
        ...parsed.data,
        availability_hours: parsed.data.availability_hours ?? {},
      })
      .select()
      .single();

    if (error) {
      console.error('POST /api/venue/resources failed:', error);
      return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/resources failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/resources - update a resource (admin only). */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'resource_booking');
    if (!modelGate.ok) return modelGate.response;

    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const parsed = resourceSchema.partial().safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data, error } = await admin
      .from('venue_resources')
      .update(parsed.data)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/venue/resources failed:', error);
      return NextResponse.json({ error: 'Failed to update resource' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/venue/resources failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/resources - delete a resource (admin only). */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'resource_booking');
    if (!modelGate.ok) return modelGate.response;
    const { error } = await admin
      .from('venue_resources')
      .delete()
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE /api/venue/resources failed:', error);
      return NextResponse.json({ error: 'Failed to delete resource' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/resources failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
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

/** Map a unified_calendars row (calendar_type='resource') to the Resource shape expected by the UI. */
function mapUnifiedCalendarToResource(row: Record<string, unknown>) {
  return {
    id: row.id,
    venue_id: row.venue_id,
    name: row.name,
    resource_type: row.resource_type ?? null,
    slot_interval_minutes: row.slot_interval_minutes ?? 30,
    min_booking_minutes: row.min_booking_minutes ?? 60,
    max_booking_minutes: row.max_booking_minutes ?? 120,
    price_per_slot_pence: row.price_per_slot_pence ?? null,
    is_active: row.is_active ?? true,
    availability_hours: row.working_hours ?? {},
    availability_exceptions: row.availability_exceptions ?? {},
    sort_order: row.sort_order ?? 0,
    created_at: row.created_at,
  };
}

/** GET /api/venue/resources - list resources for the venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('unified_calendars')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .eq('calendar_type', 'resource')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('GET /api/venue/resources failed:', error);
      return NextResponse.json({ error: 'Failed to fetch resources' }, { status: 500 });
    }

    return NextResponse.json({
      resources: (data ?? []).map((r) => mapUnifiedCalendarToResource(r as Record<string, unknown>)),
    });
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

    const { data, error } = await admin
      .from('unified_calendars')
      .insert({
        venue_id: staff.venue_id,
        calendar_type: 'resource',
        name: parsed.data.name,
        resource_type: parsed.data.resource_type ?? null,
        working_hours: parsed.data.availability_hours ?? {},
        availability_exceptions: parsed.data.availability_exceptions ?? {},
        slot_interval_minutes: parsed.data.slot_interval_minutes ?? 30,
        min_booking_minutes: parsed.data.min_booking_minutes ?? 60,
        max_booking_minutes: parsed.data.max_booking_minutes ?? 120,
        price_per_slot_pence: parsed.data.price_per_slot_pence ?? null,
        is_active: parsed.data.is_active ?? true,
        sort_order: parsed.data.sort_order ?? 0,
      })
      .select()
      .single();

    if (error) {
      console.error('POST /api/venue/resources failed:', error);
      return NextResponse.json({ error: 'Failed to create resource' }, { status: 500 });
    }

    return NextResponse.json(mapUnifiedCalendarToResource(data as Record<string, unknown>), { status: 201 });
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

    const updatePayload: Record<string, unknown> = {};
    if (parsed.data.name !== undefined) updatePayload.name = parsed.data.name;
    if (parsed.data.resource_type !== undefined) updatePayload.resource_type = parsed.data.resource_type;
    if (parsed.data.availability_hours !== undefined) updatePayload.working_hours = parsed.data.availability_hours;
    if (parsed.data.availability_exceptions !== undefined) updatePayload.availability_exceptions = parsed.data.availability_exceptions;
    if (parsed.data.slot_interval_minutes !== undefined) updatePayload.slot_interval_minutes = parsed.data.slot_interval_minutes;
    if (parsed.data.min_booking_minutes !== undefined) updatePayload.min_booking_minutes = parsed.data.min_booking_minutes;
    if (parsed.data.max_booking_minutes !== undefined) updatePayload.max_booking_minutes = parsed.data.max_booking_minutes;
    if (parsed.data.price_per_slot_pence !== undefined) updatePayload.price_per_slot_pence = parsed.data.price_per_slot_pence;
    if (parsed.data.is_active !== undefined) updatePayload.is_active = parsed.data.is_active;
    if (parsed.data.sort_order !== undefined) updatePayload.sort_order = parsed.data.sort_order;

    const { data, error } = await admin
      .from('unified_calendars')
      .update(updatePayload)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .eq('calendar_type', 'resource')
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/venue/resources failed:', error);
      return NextResponse.json({ error: 'Failed to update resource' }, { status: 500 });
    }

    return NextResponse.json(mapUnifiedCalendarToResource(data as Record<string, unknown>));
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
      .from('unified_calendars')
      .delete()
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .eq('calendar_type', 'resource');

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

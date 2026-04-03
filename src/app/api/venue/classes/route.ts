import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { checkCalendarLimit } from '@/lib/tier-enforcement';
import { requireVenueExposesSecondaryModel } from '@/lib/booking/require-venue-secondary-model';
import { z } from 'zod';

const classTypeSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  duration_minutes: z.number().int().min(5).max(480),
  capacity: z.number().int().min(1),
  instructor_id: z.string().uuid().optional().nullable(),
  instructor_name: z.string().max(200).optional().nullable(),
  price_pence: z.number().int().min(0).optional().nullable(),
  requires_online_payment: z.boolean().optional(),
  colour: z.string().max(20).optional(),
  is_active: z.boolean().optional(),
});

const timetableEntrySchema = z.object({
  class_type_id: z.string().uuid(),
  day_of_week: z.number().int().min(0).max(6),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_active: z.boolean().optional(),
  interval_weeks: z.number().int().min(1).max(8).optional(),
});

/** GET /api/venue/classes — list class types, timetable, and upcoming instances. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();

    const { data: classTypes, error: typesError } = await admin
      .from('class_types')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('name');

    if (typesError) {
      console.error('GET /api/venue/classes failed (class_types):', typesError);
      return NextResponse.json({ error: 'Failed to fetch class types' }, { status: 500 });
    }

    const ids = (classTypes ?? []).map((ct) => ct.id as string);
    if (ids.length === 0) {
      const { data: practitioners } = await admin
        .from('practitioners')
        .select('id, name, sort_order')
        .eq('venue_id', staff.venue_id)
        .order('sort_order', { ascending: true });
      return NextResponse.json({
        class_types: [],
        timetable: [],
        instances: [],
        practitioners: practitioners ?? [],
      });
    }

    const [timetableRes, instancesRes, practitionersRes] = await Promise.all([
      admin.from('class_timetable').select('*').in('class_type_id', ids),
      admin
        .from('class_instances')
        .select('*')
        .in('class_type_id', ids)
        .gte('instance_date', new Date().toISOString().slice(0, 10))
        .order('instance_date')
        .limit(200),
      admin.from('practitioners').select('id, name, sort_order').eq('venue_id', staff.venue_id).order('sort_order', { ascending: true }),
    ]);

    if (timetableRes.error) {
      console.error('GET /api/venue/classes failed (timetable):', timetableRes.error);
      return NextResponse.json({ error: 'Failed to fetch timetable' }, { status: 500 });
    }
    if (instancesRes.error) {
      console.error('GET /api/venue/classes failed (instances):', instancesRes.error);
      return NextResponse.json({ error: 'Failed to fetch instances' }, { status: 500 });
    }
    if (practitionersRes.error) {
      console.error('GET /api/venue/classes failed (practitioners):', practitionersRes.error);
      return NextResponse.json({ error: 'Failed to fetch practitioners' }, { status: 500 });
    }

    const rawInstances = instancesRes.data ?? [];
    const instanceIds = rawInstances.map((row: { id: string }) => row.id);
    const bookedByInstance: Record<string, number> = {};
    if (instanceIds.length > 0) {
      const { data: bookingRows, error: bookErr } = await admin
        .from('bookings')
        .select('class_instance_id, party_size, status')
        .eq('venue_id', staff.venue_id)
        .in('class_instance_id', instanceIds);
      if (bookErr) {
        console.error('GET /api/venue/classes booking counts failed:', bookErr);
      } else {
        for (const b of bookingRows ?? []) {
          if ((b as { status?: string }).status === 'Cancelled') continue;
          const cid = (b as { class_instance_id: string | null }).class_instance_id;
          if (!cid) continue;
          bookedByInstance[cid] =
            (bookedByInstance[cid] ?? 0) + Number((b as { party_size?: number }).party_size ?? 1);
        }
      }
    }

    const instances = rawInstances.map((row: { id: string }) => ({
      ...row,
      booked_spots: bookedByInstance[row.id] ?? 0,
    }));

    return NextResponse.json({
      class_types: classTypes ?? [],
      timetable: timetableRes.data ?? [],
      instances,
      practitioners: practitionersRes.data ?? [],
    });
  } catch (err) {
    console.error('GET /api/venue/classes failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/classes — create a class type or timetable entry (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'class_session');
    if (!modelGate.ok) return modelGate.response;

    const body = await request.json();

    // Determine what to create based on body shape
    if (body.day_of_week !== undefined) {
      // Timetable entry
      const parsed = timetableEntrySchema.safeParse(body);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
      }
      const { data, error } = await admin.from('class_timetable').insert(parsed.data).select().single();
      if (error) {
        console.error('POST /api/venue/classes (timetable) failed:', error);
        return NextResponse.json({ error: 'Failed to create timetable entry' }, { status: 500 });
      }
      return NextResponse.json({ type: 'timetable', data }, { status: 201 });
    }

    // Class type
    const parsed = classTypeSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const limitCheck = await checkCalendarLimit(staff.venue_id, 'class_types');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: 'Calendar limit reached', current: limitCheck.current, limit: limitCheck.limit, upgrade_required: true },
        { status: 403 }
      );
    }

    const { data, error } = await admin
      .from('class_types')
      .insert({ venue_id: staff.venue_id, ...parsed.data })
      .select()
      .single();

    if (error) {
      console.error('POST /api/venue/classes (class_type) failed:', error);
      return NextResponse.json({ error: 'Failed to create class type' }, { status: 500 });
    }

    return NextResponse.json({ type: 'class_type', data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/classes failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/classes — update class type, timetable entry, or instance. */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'class_session');
    if (!modelGate.ok) return modelGate.response;

    const body = await request.json();
    const { id, entity_type, ...rest } = body;
    if (!id || !entity_type) return NextResponse.json({ error: 'Missing id or entity_type' }, { status: 400 });

    if (entity_type === 'timetable') {
      const { data, error } = await admin.from('class_timetable').update(rest).eq('id', id).select().single();
      if (error) return NextResponse.json({ error: 'Failed to update timetable entry' }, { status: 500 });
      return NextResponse.json(data);
    }

    if (entity_type === 'instance') {
      const { data, error } = await admin.from('class_instances').update(rest).eq('id', id).select().single();
      if (error) return NextResponse.json({ error: 'Failed to update instance' }, { status: 500 });
      return NextResponse.json(data);
    }

    // class_type
    const parsed = classTypeSchema.partial().safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { data, error } = await admin
      .from('class_types')
      .update(parsed.data)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/venue/classes failed:', error);
      return NextResponse.json({ error: 'Failed to update class type' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/venue/classes failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/classes — delete class type, timetable entry, or instance. */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { id, entity_type } = await request.json();
    if (!id || !entity_type) return NextResponse.json({ error: 'Missing id or entity_type' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'class_session');
    if (!modelGate.ok) return modelGate.response;

    const table = entity_type === 'timetable' ? 'class_timetable' :
                  entity_type === 'instance' ? 'class_instances' : 'class_types';

    const { error } = await admin.from(table).delete().eq('id', id);
    if (error) {
      console.error(`DELETE /api/venue/classes (${entity_type}) failed:`, error);
      return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/classes failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

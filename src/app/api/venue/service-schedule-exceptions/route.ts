import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const rowSchema = z.object({
  service_id: z.string().uuid(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  is_closed: z.boolean().optional(),
  opens_extra_day: z.boolean().optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  end_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  last_booking_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

/** GET /api/venue/service-schedule-exceptions */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('service_schedule_exceptions')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('date_start', { ascending: true });

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json({ exceptions: [] });
      }
      console.error('GET service-schedule-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to fetch exceptions' }, { status: 500 });
    }

    return NextResponse.json({ exceptions: data ?? [] });
  } catch (err) {
    console.error('GET service-schedule-exceptions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = rowSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('service_schedule_exceptions')
      .insert({
        venue_id: staff.venue_id,
        ...parsed.data,
        is_closed: parsed.data.is_closed ?? false,
        opens_extra_day: parsed.data.opens_extra_day ?? false,
        start_time: parsed.data.start_time ?? null,
        end_time: parsed.data.end_time ?? null,
        last_booking_time: parsed.data.last_booking_time ?? null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('POST service-schedule-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to create exception' }, { status: 500 });
    }

    return NextResponse.json({ exception: data }, { status: 201 });
  } catch (err) {
    console.error('POST service-schedule-exceptions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const parsed = rowSchema.partial().safeParse(fields);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('service_schedule_exceptions')
      .update(parsed.data)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select('*')
      .single();

    if (error) {
      console.error('PATCH service-schedule-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to update exception' }, { status: 500 });
    }

    return NextResponse.json({ exception: data });
  } catch (err) {
    console.error('PATCH service-schedule-exceptions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { error } = await admin
      .from('service_schedule_exceptions')
      .delete()
      .eq('id', body.id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE service-schedule-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to delete exception' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE service-schedule-exceptions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

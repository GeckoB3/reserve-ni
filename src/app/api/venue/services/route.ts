import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const serviceSchema = z.object({
  name: z.string().min(1).max(100),
  days_of_week: z.array(z.number().int().min(0).max(6)).min(1),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  last_booking_time: z.string().regex(/^\d{2}:\d{2}$/),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

/** GET /api/venue/services — list services for the authenticated user's venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('venue_services')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('GET /api/venue/services failed:', error);
      return NextResponse.json({ error: 'Failed to fetch services' }, { status: 500 });
    }

    return NextResponse.json({ services: data });
  } catch (err) {
    console.error('GET /api/venue/services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/services — create a new service (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = serviceSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('venue_services')
      .insert({ venue_id: staff.venue_id, ...parsed.data })
      .select('*')
      .single();

    if (error) {
      console.error('POST /api/venue/services failed:', error);
      return NextResponse.json({ error: 'Failed to create service' }, { status: 500 });
    }

    return NextResponse.json({ service: data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/services — update an existing service (admin only). Body must include `id`. */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const { id, ...fields } = body;
    if (!id) return NextResponse.json({ error: 'Missing service id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('venue_services')
      .update(fields)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select('*')
      .single();

    if (error) {
      console.error('PATCH /api/venue/services failed:', error);
      return NextResponse.json({ error: 'Failed to update service' }, { status: 500 });
    }

    return NextResponse.json({ service: data });
  } catch (err) {
    console.error('PATCH /api/venue/services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/services — delete a service (admin only). Body must include `id`. */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Missing service id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { error } = await admin
      .from('venue_services')
      .delete()
      .eq('id', body.id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE /api/venue/services failed:', error);
      return NextResponse.json({ error: 'Failed to delete service' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/services failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

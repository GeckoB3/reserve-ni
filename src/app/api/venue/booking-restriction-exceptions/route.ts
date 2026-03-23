import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const rowSchema = z.object({
  service_id: z.string().uuid().nullable().optional(),
  date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  time_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  time_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  min_advance_minutes: z.number().int().min(0).nullable().optional(),
  max_advance_days: z.number().int().min(0).nullable().optional(),
  min_party_size_online: z.number().int().min(1).nullable().optional(),
  max_party_size_online: z.number().int().min(1).nullable().optional(),
  large_party_threshold: z.number().int().min(1).nullable().optional(),
  large_party_message: z.string().max(500).nullable().optional(),
  deposit_required_from_party_size: z.number().int().min(1).nullable().optional(),
  reason: z.string().max(500).nullable().optional(),
});

/** GET /api/venue/booking-restriction-exceptions */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('booking_restriction_exceptions')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('date_start', { ascending: true });

    if (error) {
      if (error.message?.includes('does not exist') || error.code === '42P01') {
        return NextResponse.json({ exceptions: [] });
      }
      console.error('GET booking-restriction-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to fetch exceptions' }, { status: 500 });
    }

    return NextResponse.json({ exceptions: data ?? [] });
  } catch (err) {
    console.error('GET booking-restriction-exceptions failed:', err);
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
      .from('booking_restriction_exceptions')
      .insert({
        venue_id: staff.venue_id,
        ...parsed.data,
        service_id: parsed.data.service_id ?? null,
        time_start: parsed.data.time_start ?? null,
        time_end: parsed.data.time_end ?? null,
      })
      .select('*')
      .single();

    if (error) {
      console.error('POST booking-restriction-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to create exception' }, { status: 500 });
    }

    return NextResponse.json({ exception: data }, { status: 201 });
  } catch (err) {
    console.error('POST booking-restriction-exceptions failed:', err);
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
      .from('booking_restriction_exceptions')
      .update(parsed.data)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select('*')
      .single();

    if (error) {
      console.error('PATCH booking-restriction-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to update exception' }, { status: 500 });
    }

    return NextResponse.json({ exception: data });
  } catch (err) {
    console.error('PATCH booking-restriction-exceptions failed:', err);
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
      .from('booking_restriction_exceptions')
      .delete()
      .eq('id', body.id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE booking-restriction-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to delete exception' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE booking-restriction-exceptions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

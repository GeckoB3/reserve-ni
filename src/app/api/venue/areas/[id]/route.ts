import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(120).trim().optional(),
  description: z.string().max(500).nullable().optional(),
  colour: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  sort_order: z.number().int().optional(),
  is_active: z.boolean().optional(),
});

/** PATCH /api/venue/areas/[id] */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const updates = { ...parsed.data, updated_at: new Date().toISOString() };
    const { data, error } = await admin
      .from('areas')
      .update(updates)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select('*')
      .maybeSingle();

    if (error) {
      console.error('PATCH /api/venue/areas/[id]:', error.message);
      const code = (error as { code?: string }).code;
      if (code === '23505') {
        return NextResponse.json(
          { error: 'An area with this name already exists. Choose a different name.' },
          { status: 409 },
        );
      }
      return NextResponse.json({ error: 'Failed to update area' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    return NextResponse.json({ area: data });
  } catch (err) {
    console.error('PATCH /api/venue/areas/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/areas/[id] — soft-deactivate or block when future bookings exist. */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const admin = getSupabaseAdminClient();

    const { data: areaRow, error: areaErr } = await admin
      .from('areas')
      .select('id')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();
    if (areaErr || !areaRow) {
      return NextResponse.json({ error: 'Area not found' }, { status: 404 });
    }

    const { count: activeCount } = await admin
      .from('areas')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id)
      .eq('is_active', true);

    if ((activeCount ?? 0) <= 1) {
      return NextResponse.json({ error: 'Cannot remove the last dining area' }, { status: 400 });
    }

    const today = new Date().toISOString().slice(0, 10);
    const { count: futureBookings } = await admin
      .from('bookings')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id)
      .eq('area_id', id)
      .gte('booking_date', today)
      .in('status', ['Pending', 'Booked', 'Confirmed', 'Seated']);

    if ((futureBookings ?? 0) > 0) {
      return NextResponse.json(
        { error: 'This area has upcoming bookings. Reassign or cancel them before removing the area.' },
        { status: 409 },
      );
    }

    const { error: updErr } = await admin
      .from('areas')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (updErr) {
      console.error('DELETE /api/venue/areas/[id]:', updErr.message);
      return NextResponse.json({ error: 'Failed to update area' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/areas/[id]:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

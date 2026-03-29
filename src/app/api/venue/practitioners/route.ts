import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { checkCalendarLimit } from '@/lib/tier-enforcement';
import { z } from 'zod';

const optionalEmail = z.preprocess(
  (val) => (val === '' || val === null || val === undefined ? undefined : val),
  z.string().email().optional(),
);

const practitionerSchema = z.object({
  name: z.string().min(1).max(200),
  email: optionalEmail,
  phone: z.string().max(24).optional().or(z.literal('')),
  working_hours: z.record(z.string(), z.array(z.object({ start: z.string(), end: z.string() }))).optional(),
  break_times: z.array(z.object({ start: z.string(), end: z.string() })).optional(),
  days_off: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  staff_id: z.string().uuid().optional(),
});

/** GET /api/venue/practitioners — list practitioners for the venue. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('practitioners')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('GET /api/venue/practitioners failed:', error);
      return NextResponse.json({ error: 'Failed to fetch practitioners' }, { status: 500 });
    }

    return NextResponse.json({ practitioners: data });
  } catch (err) {
    console.error('GET /api/venue/practitioners failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/practitioners — create a new practitioner (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = practitionerSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const limitCheck = await checkCalendarLimit(staff.venue_id, 'practitioners');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Calendar limit reached',
          current: limitCheck.current,
          limit: limitCheck.limit,
          upgrade_required: true,
        },
        { status: 403 }
      );
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('practitioners')
      .insert({
        venue_id: staff.venue_id,
        ...parsed.data,
        email: parsed.data.email || null,
        phone: parsed.data.phone || null,
        working_hours: parsed.data.working_hours ?? {},
        break_times: parsed.data.break_times ?? [],
        days_off: parsed.data.days_off ?? [],
      })
      .select()
      .single();

    if (error) {
      console.error('POST /api/venue/practitioners failed:', error);
      return NextResponse.json({ error: 'Failed to create practitioner' }, { status: 500 });
    }

    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/practitioners failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/practitioners — update a practitioner (admin only). */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const parsed = practitionerSchema.partial().safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('practitioners')
      .update(parsed.data)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/venue/practitioners failed:', error);
      return NextResponse.json({ error: 'Failed to update practitioner' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/venue/practitioners failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/practitioners — delete a practitioner (admin only). */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { error } = await admin
      .from('practitioners')
      .delete()
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE /api/venue/practitioners failed:', error);
      return NextResponse.json({ error: 'Failed to delete practitioner' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/practitioners failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

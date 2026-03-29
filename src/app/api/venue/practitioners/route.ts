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

const timeRangeArraySchema = z.array(z.object({ start: z.string(), end: z.string() }));

const practitionerSchema = z.object({
  name: z.string().min(1).max(200),
  email: optionalEmail,
  phone: z.string().max(24).optional().or(z.literal('')),
  working_hours: z.record(z.string(), timeRangeArraySchema).optional(),
  break_times: z.array(z.object({ start: z.string(), end: z.string() })).optional(),
  /** Non-null object = per-weekday breaks; null clears to “same every day” mode (uses break_times). */
  break_times_by_day: z.record(z.string(), timeRangeArraySchema).nullable().optional(),
  days_off: z.array(z.string()).optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
  staff_id: z.string().uuid().optional(),
});

/**
 * GET /api/venue/practitioners — list practitioners for the venue.
 * Non-admin staff normally receive only their linked practitioner row (settings / availability).
 * Pass `?roster=1` for the full venue roster (read-only) — used by appointments list and calendar
 * so staff can filter by colleague while other flows stay scoped.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const roster = request.nextUrl.searchParams.get('roster') === '1';

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

    let list = data ?? [];
    if (staff.role !== 'admin' && !roster) {
      list = list.filter((p) => p.staff_id === staff.id);
    }

    return NextResponse.json({ practitioners: list });
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

const staffBreaksOnlySchema = z.object({
  break_times: practitionerSchema.shape.break_times.optional(),
  break_times_by_day: practitionerSchema.shape.break_times_by_day.optional(),
});

/** PATCH /api/venue/practitioners — admin: any field; staff: only breaks for their linked practitioner row. */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const { id, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();

    if (staff.role !== 'admin') {
      const keys = Object.keys(rest);
      if (keys.length === 0) {
        return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
      }
      const allowed = new Set(['break_times', 'break_times_by_day', 'working_hours']);
      if (keys.some((k) => !allowed.has(k))) {
        return NextResponse.json(
          { error: 'You can only update your own working hours and breaks. Ask an admin for other changes.' },
          { status: 403 },
        );
      }

      const parsed = staffBreaksOnlySchema
        .extend({ working_hours: practitionerSchema.shape.working_hours.optional() })
        .safeParse(rest);
      if (!parsed.success) {
        return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
      }

      const { data: prac, error: pracErr } = await admin
        .from('practitioners')
        .select('id, staff_id')
        .eq('id', id)
        .eq('venue_id', staff.venue_id)
        .maybeSingle();

      if (pracErr || !prac) {
        return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
      }
      if (prac.staff_id !== staff.id) {
        return NextResponse.json(
          { error: 'You can only edit the calendar linked to your account.' },
          { status: 403 },
        );
      }

      const { data, error } = await admin
        .from('practitioners')
        .update(parsed.data)
        .eq('id', id)
        .eq('venue_id', staff.venue_id)
        .select()
        .single();

      if (error) {
        console.error('PATCH /api/venue/practitioners (staff schedule) failed:', error);
        return NextResponse.json({ error: 'Failed to update schedule' }, { status: 500 });
      }

      return NextResponse.json(data);
    }

    const parsed = practitionerSchema.partial().safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

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

    const { count: practitionerCount, error: countErr } = await admin
      .from('practitioners')
      .select('id', { count: 'exact', head: true })
      .eq('venue_id', staff.venue_id);

    if (countErr) {
      console.error('DELETE /api/venue/practitioners count failed:', countErr);
      return NextResponse.json({ error: 'Failed to verify calendars' }, { status: 500 });
    }
    if ((practitionerCount ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'You must keep at least one bookable calendar for appointment bookings.' },
        { status: 400 },
      );
    }

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

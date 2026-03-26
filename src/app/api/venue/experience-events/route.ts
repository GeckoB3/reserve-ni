import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { checkCalendarLimit } from '@/lib/tier-enforcement';
import { z } from 'zod';

const eventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  capacity: z.number().int().min(1),
  image_url: z.string().url().optional(),
  is_recurring: z.boolean().optional(),
  recurrence_rule: z.string().optional(),
  parent_event_id: z.string().uuid().optional(),
  is_active: z.boolean().optional(),
  ticket_types: z.array(z.object({
    name: z.string().min(1),
    price_pence: z.number().int().min(0),
    capacity: z.number().int().min(1).optional(),
    sort_order: z.number().int().optional(),
  })).optional(),
});

/** GET /api/venue/experience-events — list events with ticket types. */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');

    let query = admin
      .from('experience_events')
      .select('*, ticket_types:event_ticket_types(*)')
      .eq('venue_id', staff.venue_id)
      .order('event_date', { ascending: true });

    if (from) query = query.gte('event_date', from);
    if (to) query = query.lte('event_date', to);

    const { data, error } = await query;
    if (error) {
      console.error('GET /api/venue/experience-events failed:', error);
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 500 });
    }

    return NextResponse.json({ events: data });
  } catch (err) {
    console.error('GET /api/venue/experience-events failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/experience-events — create an event with ticket types (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = eventSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const limitCheck = await checkCalendarLimit(staff.venue_id, 'experience_events');
    if (!limitCheck.allowed) {
      return NextResponse.json(
        { error: 'Calendar limit reached', current: limitCheck.current, limit: limitCheck.limit, upgrade_required: true },
        { status: 403 }
      );
    }

    const { ticket_types, ...eventData } = parsed.data;
    const admin = getSupabaseAdminClient();

    const { data: event, error } = await admin
      .from('experience_events')
      .insert({ venue_id: staff.venue_id, ...eventData })
      .select()
      .single();

    if (error) {
      console.error('POST /api/venue/experience-events failed:', error);
      return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
    }

    if (ticket_types && ticket_types.length > 0) {
      const ttRows = ticket_types.map((tt, i) => ({
        event_id: event.id,
        name: tt.name,
        price_pence: tt.price_pence,
        capacity: tt.capacity ?? null,
        sort_order: tt.sort_order ?? i,
      }));
      await admin.from('event_ticket_types').insert(ttRows);
    }

    const { data: full } = await admin
      .from('experience_events')
      .select('*, ticket_types:event_ticket_types(*)')
      .eq('id', event.id)
      .single();

    return NextResponse.json(full, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/experience-events failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/experience-events — update an event (admin only). */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const { id, ticket_types, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const parsed = eventSchema.partial().safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { error } = await admin
      .from('experience_events')
      .update(parsed.data)
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('PATCH /api/venue/experience-events failed:', error);
      return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
    }

    // Replace ticket types if provided
    if (Array.isArray(ticket_types)) {
      await admin.from('event_ticket_types').delete().eq('event_id', id);
      if (ticket_types.length > 0) {
        const ttRows = ticket_types.map((tt: { name: string; price_pence: number; capacity?: number; sort_order?: number }, i: number) => ({
          event_id: id,
          name: tt.name,
          price_pence: tt.price_pence,
          capacity: tt.capacity ?? null,
          sort_order: tt.sort_order ?? i,
        }));
        await admin.from('event_ticket_types').insert(ttRows);
      }
    }

    const { data: full } = await admin
      .from('experience_events')
      .select('*, ticket_types:event_ticket_types(*)')
      .eq('id', id)
      .single();

    return NextResponse.json(full);
  } catch (err) {
    console.error('PATCH /api/venue/experience-events failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/experience-events — delete an event (admin only). */
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
      .from('experience_events')
      .delete()
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE /api/venue/experience-events failed:', error);
      return NextResponse.json({ error: 'Failed to delete event' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/experience-events failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

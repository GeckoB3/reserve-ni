import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { checkExperienceEventBatchLimit } from '@/lib/tier-enforcement';
import { requireVenueExposesSecondaryModel } from '@/lib/booking/require-venue-secondary-model';
import { expandWeeklyOccurrences, normaliseCustomDates } from '@/lib/scheduling/experience-event-dates';
import { MAX_MATERIALISED_EVENT_OCCURRENCES } from '@/lib/scheduling/cde-scheduling-rules';
import {
  assertExperienceEventDeletable,
  resolveExperienceEventPatch,
  validateStartEndTimes,
} from '@/lib/experience-events/experience-event-guards';
import { z } from 'zod';

const eventSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  event_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start_time: z.string().regex(/^\d{2}:\d{2}$/),
  end_time: z.string().regex(/^\d{2}:\d{2}$/),
  capacity: z.number().int().min(1),
  image_url: z.preprocess((v) => (v === '' || v === null ? undefined : v), z.string().url().optional()),
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

const scheduleSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('single') }),
  z.object({
    type: z.literal('weekly'),
    until_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }),
  z.object({
    type: z.literal('custom'),
    dates: z.array(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)).min(1),
  }),
]);

const createEventBodySchema = eventSchema.extend({
  schedule: scheduleSchema.optional(),
});

/** GET /api/venue/experience-events - list events with ticket types. */
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

/** POST /api/venue/experience-events - create an event with ticket types (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'event_ticket');
    if (!modelGate.ok) return modelGate.response;

    const body = await request.json();
    const parsed = createEventBodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { ticket_types, schedule, ...eventFields } = parsed.data;

    const timeErr = validateStartEndTimes(eventFields.start_time, eventFields.end_time);
    if (timeErr) {
      return NextResponse.json({ error: timeErr }, { status: 400 });
    }

    let datesToCreate: string[] = [eventFields.event_date];
    const sched = schedule ?? { type: 'single' as const };
    if (sched.type === 'weekly') {
      datesToCreate = expandWeeklyOccurrences(eventFields.event_date, sched.until_date);
    } else if (sched.type === 'custom') {
      datesToCreate = normaliseCustomDates(sched.dates);
    }

    if (datesToCreate.length === 0) {
      return NextResponse.json({ error: 'No valid event dates to create' }, { status: 400 });
    }
    if (datesToCreate.length > MAX_MATERIALISED_EVENT_OCCURRENCES) {
      return NextResponse.json(
        { error: `At most ${MAX_MATERIALISED_EVENT_OCCURRENCES} occurrences per save` },
        { status: 400 },
      );
    }

    const batchCheck = await checkExperienceEventBatchLimit(staff.venue_id, datesToCreate.length);
    if (!batchCheck.allowed) {
      return NextResponse.json(
        {
          error: 'Calendar limit reached for your plan',
          current: batchCheck.current,
          limit: batchCheck.limit,
          upgrade_required: true,
        },
        { status: 403 },
      );
    }

    const baseInsert = {
      venue_id: staff.venue_id,
      name: eventFields.name,
      description: eventFields.description ?? null,
      start_time: eventFields.start_time.length === 5 ? `${eventFields.start_time}:00` : eventFields.start_time,
      end_time: eventFields.end_time.length === 5 ? `${eventFields.end_time}:00` : eventFields.end_time,
      capacity: eventFields.capacity,
      image_url: eventFields.image_url ?? null,
      is_recurring: false,
      recurrence_rule: null as string | null,
      parent_event_id: null as string | null,
      is_active: eventFields.is_active ?? true,
    };

    const createdIds: string[] = [];

    for (const eventDate of datesToCreate) {
      const { data: event, error } = await admin
        .from('experience_events')
        .insert({
          ...baseInsert,
          event_date: eventDate,
        })
        .select('id')
        .single();

      if (error || !event) {
        console.error('POST /api/venue/experience-events failed:', error);
        return NextResponse.json({ error: 'Failed to create event' }, { status: 500 });
      }

      const eid = event.id as string;
      createdIds.push(eid);

      if (ticket_types && ticket_types.length > 0) {
        const ttRows = ticket_types.map((tt, i) => ({
          event_id: eid,
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
      .eq('id', createdIds[0]!)
      .single();

    return NextResponse.json(
      { created: createdIds.length, event_ids: createdIds, ...(full ?? {}) },
      { status: 201 },
    );
  } catch (err) {
    console.error('POST /api/venue/experience-events failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/experience-events - update an event (admin only). */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'event_ticket');
    if (!modelGate.ok) return modelGate.response;

    const body = await request.json();
    const { id, ticket_types, ...rest } = body;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const parsed = eventSchema.partial().safeParse(rest);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const resolved = await resolveExperienceEventPatch(admin, staff.venue_id, id, parsed.data);
    if (!resolved.ok) {
      return NextResponse.json({ error: resolved.error }, { status: resolved.error === 'Event not found' ? 404 : 400 });
    }

    if (Object.keys(resolved.payload).length > 0) {
      const { error } = await admin
        .from('experience_events')
        .update(resolved.payload)
        .eq('id', id)
        .eq('venue_id', staff.venue_id);

      if (error) {
        console.error('PATCH /api/venue/experience-events failed:', error);
        return NextResponse.json({ error: 'Failed to update event' }, { status: 500 });
      }
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

/** DELETE /api/venue/experience-events - delete an event (admin only). */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { id } = await request.json();
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const modelGate = await requireVenueExposesSecondaryModel(admin, staff.venue_id, 'event_ticket');
    if (!modelGate.ok) return modelGate.response;

    const canDelete = await assertExperienceEventDeletable(admin, staff.venue_id, id);
    if (!canDelete.ok) {
      return NextResponse.json(
        { error: canDelete.error, booking_count: canDelete.booking_count },
        { status: 409 },
      );
    }

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

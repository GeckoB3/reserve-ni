import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const yieldOverridesSchema = z
  .object({
    max_bookings_per_slot: z.number().int().min(1).max(500).optional(),
    slot_interval_minutes: z.number().int().min(5).max(120).optional(),
    buffer_minutes: z.number().int().min(0).max(120).optional(),
    duration_minutes: z.number().int().min(15).max(300).optional(),
  })
  .strict()
  .nullable()
  .optional();

const overridePeriodsSchema = z
  .array(
    z.object({
      open: z.string().regex(/^\d{2}:\d{2}$/),
      close: z.string().regex(/^\d{2}:\d{2}$/),
    }),
  )
  .min(1)
  .max(4)
  .nullable()
  .optional();

const blockSchema = z
  .object({
    service_id: z.string().uuid().nullable().optional(),
    block_type: z.enum(['closed', 'reduced_capacity', 'special_event', 'amended_hours']),
    date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    time_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    time_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    override_max_covers: z.number().int().min(0).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    yield_overrides: yieldOverridesSchema,
    override_periods: overridePeriodsSchema,
  })
  .refine(
    (v) => v.block_type !== 'amended_hours' || (Array.isArray(v.override_periods) && v.override_periods.length > 0),
    { message: 'override_periods required for amended_hours', path: ['override_periods'] },
  );

const blockPatchSchema = z
  .object({
    id: z.string().uuid(),
    service_id: z.string().uuid().nullable().optional(),
    block_type: z.enum(['closed', 'reduced_capacity', 'special_event', 'amended_hours']).optional(),
    date_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    date_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    time_start: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    time_end: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
    override_max_covers: z.number().int().min(0).nullable().optional(),
    reason: z.string().max(500).nullable().optional(),
    yield_overrides: yieldOverridesSchema,
    override_periods: overridePeriodsSchema,
  });

/** GET /api/venue/availability-blocks */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('availability_blocks')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('date_start', { ascending: true });

    if (error) {
      console.error('GET /api/venue/availability-blocks failed:', error);
      return NextResponse.json({ error: 'Failed to fetch blocks' }, { status: 500 });
    }

    return NextResponse.json({ blocks: data });
  } catch (err) {
    console.error('GET /api/venue/availability-blocks failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** POST /api/venue/availability-blocks - create a block (admin only). */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = blockSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('availability_blocks')
      .insert({ venue_id: staff.venue_id, ...parsed.data })
      .select('*')
      .single();

    if (error) {
      console.error('POST /api/venue/availability-blocks failed:', error);
      return NextResponse.json({ error: 'Failed to create block' }, { status: 500 });
    }

    return NextResponse.json({ block: data }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/availability-blocks failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/availability-blocks */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    const parsed = blockPatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, ...fields } = parsed.data;
    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('availability_blocks')
      .update(fields)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select('*')
      .single();

    if (error) {
      console.error('PATCH /api/venue/availability-blocks failed:', error);
      return NextResponse.json({ error: 'Failed to update block' }, { status: 500 });
    }

    return NextResponse.json({ block: data });
  } catch (err) {
    console.error('PATCH /api/venue/availability-blocks failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/availability-blocks */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { error } = await admin.from('availability_blocks').delete().eq('id', body.id).eq('venue_id', staff.venue_id);
    if (error) {
      console.error('DELETE /api/venue/availability-blocks failed:', error);
      return NextResponse.json({ error: 'Failed to delete block' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/availability-blocks failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

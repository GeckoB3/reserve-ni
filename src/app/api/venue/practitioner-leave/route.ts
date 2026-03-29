import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const postSchema = z
  .object({
    practitioner_id: z.string().uuid().optional(),
    apply_to_all_active: z.boolean().optional(),
    start_date: isoDate,
    end_date: isoDate,
    leave_type: z.enum(['annual', 'sick', 'other']),
    notes: z.string().max(500).optional().nullable(),
  })
  .refine((d) => d.end_date >= d.start_date, { message: 'End date must be on or after start date' })
  .refine((d) => Boolean(d.practitioner_id) || d.apply_to_all_active === true, {
    message: 'Choose a team member or select “whole team”',
  });

const patchSchema = z.object({
  id: z.string().uuid(),
  start_date: isoDate.optional(),
  end_date: isoDate.optional(),
  leave_type: z.enum(['annual', 'sick', 'other']).optional(),
  notes: z.union([z.string().max(500), z.null()]).optional(),
});

/** GET ?from=YYYY-MM-DD&to=YYYY-MM-DD&practitioner_id=optional */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const practitionerId = searchParams.get('practitioner_id') ?? undefined;
    if (!from || !to) {
      return NextResponse.json({ error: 'Missing from or to (YYYY-MM-DD)' }, { status: 400 });
    }
    if (from > to) {
      return NextResponse.json({ error: 'from must be on or before to' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    const filterPractitionerId: string | undefined = practitionerId ?? undefined;

    if (staff.role !== 'admin') {
      const { data: mine } = await admin
        .from('practitioners')
        .select('id')
        .eq('venue_id', staff.venue_id)
        .eq('staff_id', staff.id)
        .maybeSingle();
      if (!mine?.id) {
        return NextResponse.json({ periods: [] });
      }
      if (filterPractitionerId) {
        const { data: pRow } = await admin
          .from('practitioners')
          .select('id')
          .eq('id', filterPractitionerId)
          .eq('venue_id', staff.venue_id)
          .maybeSingle();
        if (!pRow) {
          return NextResponse.json({ error: 'Practitioner not found' }, { status: 404 });
        }
      }
    } else if (filterPractitionerId) {
      const { data: pRow } = await admin
        .from('practitioners')
        .select('id')
        .eq('id', filterPractitionerId)
        .eq('venue_id', staff.venue_id)
        .maybeSingle();
      if (!pRow) {
        return NextResponse.json({ error: 'Practitioner not found' }, { status: 404 });
      }
    }

    let query = admin
      .from('practitioner_leave_periods')
      .select(
        'id, practitioner_id, start_date, end_date, leave_type, notes, created_at, practitioner:practitioners(name)',
      )
      .eq('venue_id', staff.venue_id)
      .lte('start_date', to)
      .gte('end_date', from)
      .order('start_date', { ascending: true });

    if (filterPractitionerId) {
      query = query.eq('practitioner_id', filterPractitionerId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('GET /api/venue/practitioner-leave failed:', error);
      return NextResponse.json({ error: 'Failed to load leave' }, { status: 500 });
    }

    const periods = (data ?? []).map((row: Record<string, unknown>) => {
      const pr = row.practitioner as { name?: string } | null;
      return {
        id: row.id,
        practitioner_id: row.practitioner_id,
        practitioner_name: pr?.name ?? 'Team member',
        start_date: row.start_date,
        end_date: row.end_date,
        leave_type: row.leave_type,
        notes: row.notes,
        created_at: row.created_at,
      };
    });

    return NextResponse.json({ periods });
  } catch (err) {
    console.error('GET /api/venue/practitioner-leave failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const parsed = postSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const { practitioner_id, apply_to_all_active, start_date, end_date, leave_type, notes } = parsed.data;

    if (staff.role !== 'admin') {
      const { data: mine } = await admin
        .from('practitioners')
        .select('id')
        .eq('venue_id', staff.venue_id)
        .eq('staff_id', staff.id)
        .maybeSingle();
      if (!mine?.id) {
        return NextResponse.json({ error: 'No calendar linked to your account' }, { status: 403 });
      }
      if (apply_to_all_active) {
        return NextResponse.json({ error: 'Only admins can add whole-team time off' }, { status: 403 });
      }
      if (!practitioner_id || practitioner_id !== mine.id) {
        return NextResponse.json({ error: 'You can only add time off for your own calendar' }, { status: 403 });
      }
      const rows = [
        {
          venue_id: staff.venue_id,
          practitioner_id: mine.id,
          start_date,
          end_date,
          leave_type,
          notes: notes?.trim() ?? null,
        },
      ];
      const { data, error } = await admin.from('practitioner_leave_periods').insert(rows).select('id');
      if (error) {
        console.error('POST /api/venue/practitioner-leave (staff) failed:', error);
        return NextResponse.json({ error: 'Failed to save leave' }, { status: 500 });
      }
      return NextResponse.json(
        { created: data?.length ?? 0, ids: (data ?? []).map((r: { id: string }) => r.id) },
        { status: 201 },
      );
    }

    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    let practitionerIds: string[] = [];
    if (apply_to_all_active) {
      const { data: pracs, error: prErr } = await admin
        .from('practitioners')
        .select('id')
        .eq('venue_id', staff.venue_id)
        .eq('is_active', true);
      if (prErr) {
        console.error('POST practitioner-leave list practitioners:', prErr);
        return NextResponse.json({ error: 'Failed to resolve team members' }, { status: 500 });
      }
      practitionerIds = (pracs ?? []).map((p: { id: string }) => p.id);
      if (practitionerIds.length === 0) {
        return NextResponse.json({ error: 'No active team members to add leave for' }, { status: 400 });
      }
    } else if (practitioner_id) {
      const { data: one, error: oneErr } = await admin
        .from('practitioners')
        .select('id')
        .eq('id', practitioner_id)
        .eq('venue_id', staff.venue_id)
        .maybeSingle();
      if (oneErr || !one) {
        return NextResponse.json({ error: 'Team member not found' }, { status: 404 });
      }
      practitionerIds = [practitioner_id];
    }

    const rows = practitionerIds.map((pid) => ({
      venue_id: staff.venue_id,
      practitioner_id: pid,
      start_date,
      end_date,
      leave_type,
      notes: notes?.trim() || null,
    }));

    const { data, error } = await admin.from('practitioner_leave_periods').insert(rows).select('id');

    if (error) {
      console.error('POST /api/venue/practitioner-leave failed:', error);
      return NextResponse.json({ error: 'Failed to save leave' }, { status: 500 });
    }

    return NextResponse.json({ created: data?.length ?? 0, ids: (data ?? []).map((r: { id: string }) => r.id) }, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/practitioner-leave failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { id, ...rawUpdates } = parsed.data;
    const updates = Object.fromEntries(
      Object.entries(rawUpdates).filter(([, v]) => v !== undefined),
    ) as Record<string, unknown>;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    if (
      typeof updates.start_date === 'string' &&
      typeof updates.end_date === 'string' &&
      updates.end_date < updates.start_date
    ) {
      return NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    if (staff.role !== 'admin') {
      const { data: mine } = await admin
        .from('practitioners')
        .select('id')
        .eq('venue_id', staff.venue_id)
        .eq('staff_id', staff.id)
        .maybeSingle();
      if (!mine?.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { data: leaveRow, error: leaveErr } = await admin
        .from('practitioner_leave_periods')
        .select('id, practitioner_id, start_date, end_date')
        .eq('id', id)
        .eq('venue_id', staff.venue_id)
        .maybeSingle();
      if (leaveErr || !leaveRow || leaveRow.practitioner_id !== mine.id) {
        return NextResponse.json({ error: 'Leave entry not found' }, { status: 404 });
      }
    } else if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const { data: existing, error: exErr } = await admin
      .from('practitioner_leave_periods')
      .select('id, start_date, end_date')
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (exErr || !existing) {
      return NextResponse.json({ error: 'Leave entry not found' }, { status: 404 });
    }

    const nextStart = (updates.start_date as string | undefined) ?? (existing as { start_date: string }).start_date;
    const nextEnd = (updates.end_date as string | undefined) ?? (existing as { end_date: string }).end_date;
    if (nextEnd < nextStart) {
      return NextResponse.json({ error: 'End date must be on or after start date' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('practitioner_leave_periods')
      .update(updates)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select()
      .single();

    if (error) {
      console.error('PATCH /api/venue/practitioner-leave failed:', error);
      return NextResponse.json({ error: 'Failed to update leave' }, { status: 500 });
    }

    return NextResponse.json(data);
  } catch (err) {
    console.error('PATCH /api/venue/practitioner-leave failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const id = body?.id as string | undefined;
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();

    if (staff.role !== 'admin') {
      const { data: mine } = await admin
        .from('practitioners')
        .select('id')
        .eq('venue_id', staff.venue_id)
        .eq('staff_id', staff.id)
        .maybeSingle();
      if (!mine?.id) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const { data: leaveRow, error: leaveErr } = await admin
        .from('practitioner_leave_periods')
        .select('id, practitioner_id')
        .eq('id', id)
        .eq('venue_id', staff.venue_id)
        .maybeSingle();
      if (leaveErr || !leaveRow || leaveRow.practitioner_id !== mine.id) {
        return NextResponse.json({ error: 'Leave entry not found' }, { status: 404 });
      }
    } else if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const { error } = await admin
      .from('practitioner_leave_periods')
      .delete()
      .eq('id', id)
      .eq('venue_id', staff.venue_id);

    if (error) {
      console.error('DELETE /api/venue/practitioner-leave failed:', error);
      return NextResponse.json({ error: 'Failed to delete leave' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/practitioner-leave failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

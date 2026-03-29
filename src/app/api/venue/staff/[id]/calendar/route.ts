import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { setStaffPractitionerLink } from '@/lib/staff-practitioner-link';
import { z } from 'zod';

const bodySchema = z.object({
  practitioner_id: z.string().uuid().nullable(),
});

/**
 * PATCH /api/venue/staff/[id]/calendar
 * Admin: assign or unassign a user account to a practitioner calendar (Model B appointments).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    if (!requireAdmin(staff)) return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });

    const { id: targetStaffId } = await params;
    const body = await request.json();
    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();

    const { data: venue } = await admin
      .from('venues')
      .select('booking_model')
      .eq('id', staff.venue_id)
      .single();

    if ((venue?.booking_model as string) !== 'practitioner_appointment') {
      return NextResponse.json(
        { error: 'Calendar linking is only available for appointment businesses' },
        { status: 400 },
      );
    }

    const { data: target } = await admin
      .from('staff')
      .select('id')
      .eq('id', targetStaffId)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (!target) {
      return NextResponse.json({ error: 'Staff member not found' }, { status: 404 });
    }

    const result = await setStaffPractitionerLink(
      admin,
      staff.venue_id,
      targetStaffId,
      parsed.data.practitioner_id,
    );

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    let linkedName: string | null = null;
    if (parsed.data.practitioner_id) {
      const { data: pr } = await admin
        .from('practitioners')
        .select('name')
        .eq('id', parsed.data.practitioner_id)
        .eq('venue_id', staff.venue_id)
        .maybeSingle();
      linkedName = pr?.name ?? null;
    }

    return NextResponse.json({
      linked_practitioner_id: parsed.data.practitioner_id,
      linked_practitioner_name: linkedName,
    });
  } catch (err) {
    console.error('PATCH /api/venue/staff/[id]/calendar failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

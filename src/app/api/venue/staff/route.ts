import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';

/** GET /api/venue/staff — list staff for the venue (admin only). Includes linked practitioner for Model B. */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const { data: rows, error } = await staff.db
      .from('staff')
      .select('id, email, name, phone, role, created_at')
      .eq('venue_id', staff.venue_id)
      .order('created_at', { ascending: true });

    if (error) {
      console.error('GET /api/venue/staff failed:', error);
      return NextResponse.json({ error: 'Failed to load staff' }, { status: 500 });
    }

    const { data: pracs } = await staff.db
      .from('practitioners')
      .select('id, name, staff_id')
      .eq('venue_id', staff.venue_id);

    const list = (rows ?? []).map((row) => {
      const p = pracs?.find((pr) => pr.staff_id === row.id);
      return {
        ...row,
        linked_practitioner_id: p?.id ?? null,
        linked_practitioner_name: p?.name ?? null,
      };
    });

    return NextResponse.json({ staff: list });
  } catch (err) {
    console.error('GET /api/venue/staff failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

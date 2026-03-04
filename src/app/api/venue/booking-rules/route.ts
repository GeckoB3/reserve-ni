import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { bookingRulesSchema } from '@/types/config-schemas';

/** PATCH /api/venue/booking-rules — update booking_rules (admin only). */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
    if (!requireAdmin(staff)) {
      return NextResponse.json({ error: 'Forbidden: admin only' }, { status: 403 });
    }

    const body = await request.json();
    const parsed = bookingRulesSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const booking_rules = parsed.data;

    const { data: venue, error } = await staff.db
      .from('venues')
      .update({ booking_rules, updated_at: new Date().toISOString() })
      .eq('id', staff.venue_id)
      .select('booking_rules')
      .single();

    if (error) {
      console.error('PATCH /api/venue/booking-rules failed:', error);
      return NextResponse.json({ error: 'Failed to update booking rules' }, { status: 500 });
    }

    return NextResponse.json({ booking_rules: venue.booking_rules });
  } catch (err) {
    console.error('PATCH /api/venue/booking-rules failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

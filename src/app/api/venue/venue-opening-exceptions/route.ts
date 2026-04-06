import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff, requireAdmin } from '@/lib/venue-auth';
import { parseVenueOpeningExceptions, venueOpeningExceptionsPayloadSchema } from '@/types/venue-opening-exceptions';

/** GET /api/venue/venue-opening-exceptions */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data, error } = await staff.db
      .from('venues')
      .select('venue_opening_exceptions')
      .eq('id', staff.venue_id)
      .single();

    if (error) {
      console.error('GET /api/venue/venue-opening-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to load exceptions' }, { status: 500 });
    }

    const exceptions = parseVenueOpeningExceptions((data as { venue_opening_exceptions?: unknown }).venue_opening_exceptions);
    return NextResponse.json({ exceptions });
  } catch (err) {
    console.error('GET /api/venue/venue-opening-exceptions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/venue-opening-exceptions — replace full list (admin only). */
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
    const parsed = venueOpeningExceptionsPayloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { data: venue, error } = await staff.db
      .from('venues')
      .update({
        venue_opening_exceptions: parsed.data.exceptions,
        updated_at: new Date().toISOString(),
      })
      .eq('id', staff.venue_id)
      .select('venue_opening_exceptions')
      .single();

    if (error) {
      console.error('PATCH /api/venue/venue-opening-exceptions failed:', error);
      return NextResponse.json({ error: 'Failed to save exceptions' }, { status: 500 });
    }

    const exceptions = parseVenueOpeningExceptions((venue as { venue_opening_exceptions?: unknown }).venue_opening_exceptions);
    return NextResponse.json({ exceptions });
  } catch (err) {
    console.error('PATCH /api/venue/venue-opening-exceptions failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

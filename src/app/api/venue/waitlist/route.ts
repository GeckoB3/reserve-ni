import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';

/** GET /api/venue/waitlist — list waitlist entries for the venue */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const { data, error } = await admin
      .from('waitlist_entries')
      .select('*')
      .eq('venue_id', staff.venue_id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('GET /api/venue/waitlist failed:', error);
      return NextResponse.json({ error: 'Failed to fetch waitlist' }, { status: 500 });
    }

    return NextResponse.json({ entries: data });
  } catch (err) {
    console.error('GET /api/venue/waitlist failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** PATCH /api/venue/waitlist — update entry status (offer, confirm, cancel). Body: { id, status, expires_at? } */
export async function PATCH(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    const { id, status, expires_at } = body;
    if (!id || !status) return NextResponse.json({ error: 'Missing id or status' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const updateFields: Record<string, unknown> = { status };
    if (status === 'offered') {
      updateFields.offered_at = new Date().toISOString();
      updateFields.expires_at = expires_at ?? new Date(Date.now() + 30 * 60 * 1000).toISOString();
    }

    const { data, error } = await admin
      .from('waitlist_entries')
      .update(updateFields)
      .eq('id', id)
      .eq('venue_id', staff.venue_id)
      .select('*')
      .single();

    if (error) {
      console.error('PATCH /api/venue/waitlist failed:', error);
      return NextResponse.json({ error: 'Failed to update entry' }, { status: 500 });
    }

    return NextResponse.json({ entry: data });
  } catch (err) {
    console.error('PATCH /api/venue/waitlist failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** DELETE /api/venue/waitlist — remove an entry. Body: { id } */
export async function DELETE(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const body = await request.json();
    if (!body.id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const admin = getSupabaseAdminClient();
    const { error } = await admin.from('waitlist_entries').delete().eq('id', body.id).eq('venue_id', staff.venue_id);
    if (error) {
      console.error('DELETE /api/venue/waitlist failed:', error);
      return NextResponse.json({ error: 'Failed to delete entry' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('DELETE /api/venue/waitlist failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

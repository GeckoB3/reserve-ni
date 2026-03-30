import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';

const bodySchema = z.object({
  guest_id: z.string().uuid(),
});

/**
 * POST /api/venue/gdpr/erase-guest
 * Staff-only. Anonymises guest PII and clears identifiable fields on related bookings.
 * Bookings are retained for venue records; guest row is kept with placeholders (FK RESTRICT on bookings).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
    }

    const { guest_id: guestId } = parsed.data;
    const admin = getSupabaseAdminClient();

    const { data: guest, error: guestErr } = await admin
      .from('guests')
      .select('id, venue_id')
      .eq('id', guestId)
      .eq('venue_id', staff.venue_id)
      .maybeSingle();

    if (guestErr || !guest) {
      return NextResponse.json({ error: 'Guest not found' }, { status: 404 });
    }

    await admin.from('communications').delete().eq('guest_id', guestId);

    const { data: bookingIdsRows } = await admin.from('bookings').select('id').eq('guest_id', guestId);
    const bookingIds = (bookingIdsRows ?? []).map((r: { id: string }) => r.id);
    if (bookingIds.length > 0) {
      await admin.from('communication_logs').delete().in('booking_id', bookingIds);
    }

    await admin
      .from('bookings')
      .update({
        dietary_notes: null,
        occasion: null,
        special_requests: null,
        internal_notes: null,
        guest_email: null,
        updated_at: new Date().toISOString(),
      })
      .eq('guest_id', guestId);

    const { error: updErr } = await admin
      .from('guests')
      .update({
        name: '[Erased]',
        email: null,
        phone: null,
        global_guest_hash: null,
        dietary_preferences: null,
        marketing_opt_out: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', guestId)
      .eq('venue_id', staff.venue_id);

    if (updErr) {
      console.error('erase-guest: guest update failed:', updErr);
      return NextResponse.json({ error: 'Failed to erase guest data' }, { status: 500 });
    }

    return NextResponse.json({ success: true, guest_id: guestId });
  } catch (err) {
    console.error('POST /api/venue/gdpr/erase-guest failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

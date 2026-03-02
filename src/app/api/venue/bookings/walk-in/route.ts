import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { z } from 'zod';

const walkInSchema = z.object({
  party_size: z.number().int().min(1).max(50),
  name: z.string().max(200).optional(),
});

/**
 * POST /api/venue/bookings/walk-in
 * Quick add walk-in: source walk-in, status Seated, no deposit.
 * Body: { party_size, name? }. Uses today's date and current time (rounded to next 15 min).
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const body = await request.json();
    const parsed = walkInSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Invalid request', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { party_size, name } = parsed.data;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const min = now.getHours() * 60 + now.getMinutes();
    const nextSlot = Math.ceil(min / 15) * 15;
    const bookingTime = `${Math.floor(nextSlot / 60).toString().padStart(2, '0')}:${(nextSlot % 60).toString().padStart(2, '0')}:00`;

    const admin = getSupabaseAdminClient();

    const { data: guest, error: guestErr } = await admin
      .from('guests')
      .insert({
        venue_id: staff.venue_id,
        name: name?.trim() || 'Walk-in',
        email: null,
        phone: null,
        visit_count: 1,
      })
      .select('id')
      .single();

    if (guestErr) {
      console.error('Walk-in guest insert failed:', guestErr);
      return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 });
    }

    const { data: booking, error: bookErr } = await admin
      .from('bookings')
      .insert({
        venue_id: staff.venue_id,
        guest_id: guest.id,
        booking_date: today,
        booking_time: bookingTime,
        party_size,
        status: 'Seated',
        source: 'walk-in',
        deposit_status: 'Not Required',
      })
      .select('id, booking_date, booking_time, party_size, status, source')
      .single();

    if (bookErr) {
      console.error('Walk-in booking insert failed:', bookErr);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/bookings/walk-in failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

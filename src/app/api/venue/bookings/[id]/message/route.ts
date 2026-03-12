import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { sendCommunication } from '@/lib/communications';

const schema = z.object({
  message: z.string().min(1).max(500),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const body = await request.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Message is required' }, { status: 400 });

  const { data: booking } = await staff.db
    .from('bookings')
    .select('id, venue_id, guest_id')
    .eq('id', id)
    .eq('venue_id', staff.venue_id)
    .single();
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const [{ data: guest }, { data: venue }] = await Promise.all([
    staff.db.from('guests').select('name, email, phone').eq('id', booking.guest_id).single(),
    staff.db.from('venues').select('name').eq('id', booking.venue_id).single(),
  ]);

  if (!guest || !venue?.name) return NextResponse.json({ error: 'Guest or venue not found' }, { status: 400 });

  await sendCommunication({
    type: 'custom_message',
    recipient: { email: guest.email ?? undefined, phone: guest.phone ?? undefined },
    payload: {
      guest_name: guest.name ?? 'Guest',
      venue_name: venue.name,
      message: parsed.data.message,
    },
    venue_id: booking.venue_id,
    booking_id: booking.id,
    guest_id: booking.guest_id,
  });

  return NextResponse.json({ success: true });
}

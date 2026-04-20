import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { sendCommunication } from '@/lib/communications';
import type { GuestMessageChannel } from '@/lib/booking/guest-message-channel';

const schema = z.object({
  message: z.string().min(1).max(2000),
  channel: z.enum(['email', 'sms', 'both']).optional().default('both'),
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

  const channel = parsed.data.channel as GuestMessageChannel;
  const email = typeof guest.email === 'string' && guest.email.trim() ? guest.email.trim() : undefined;
  const phone = typeof guest.phone === 'string' && guest.phone.trim() ? guest.phone.trim() : undefined;

  if (channel === 'email' && !email) {
    return NextResponse.json({ error: 'Guest has no email on file' }, { status: 400 });
  }
  if (channel === 'sms' && !phone) {
    return NextResponse.json({ error: 'Guest has no phone on file' }, { status: 400 });
  }
  if (channel === 'both' && !email && !phone) {
    return NextResponse.json({ error: 'Guest has no email or phone on file' }, { status: 400 });
  }

  const recipient =
    channel === 'sms'
      ? { phone }
      : channel === 'email'
        ? { email }
        : { email, phone };

  await sendCommunication({
    type: 'custom_message',
    recipient,
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

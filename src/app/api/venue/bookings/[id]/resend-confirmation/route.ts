import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';
import { createShortManageLink } from '@/lib/short-manage-link';
import { generateConfirmToken, hashConfirmToken } from '@/lib/confirm-token';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createClient();
  const staff = await getVenueStaff(supabase);
  if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await params;
  const admin = getSupabaseAdminClient();

  const { data: booking } = await admin
    .from('bookings')
    .select('id, venue_id, guest_id, booking_date, booking_time, party_size, cancellation_deadline')
    .eq('id', id)
    .eq('venue_id', staff.venue_id)
    .maybeSingle();
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 });

  const [{ data: guest }, { data: venue }] = await Promise.all([
    admin.from('guests').select('name, email, phone').eq('id', booking.guest_id).maybeSingle(),
    admin.from('venues').select('name').eq('id', booking.venue_id).maybeSingle(),
  ]);
  if (!venue?.name || (!guest?.email && !guest?.phone)) {
    return NextResponse.json({ error: 'Guest contact not available' }, { status: 400 });
  }

  const manageToken = generateConfirmToken();
  await admin
    .from('bookings')
    .update({
      confirm_token_hash: hashConfirmToken(manageToken),
      confirm_token_used_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', booking.id);

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : request.nextUrl.origin);
  const manageBookingLink = `${baseUrl}/manage/${booking.id}/${encodeURIComponent(manageToken)}`;
  const shortManageLink = createShortManageLink(booking.id);

  await sendCommunication({
    type: 'booking_confirmation',
    recipient: { email: guest.email ?? undefined, phone: guest.phone ?? undefined },
    payload: {
      guest_name: guest.name ?? 'Guest',
      venue_name: venue.name,
      booking_date: booking.booking_date,
      booking_time: booking.booking_time?.slice(0, 5) ?? '00:00',
      party_size: booking.party_size,
      cancellation_deadline: booking.cancellation_deadline,
      manage_booking_link: manageBookingLink,
      short_manage_link: shortManageLink,
    },
  });

  return NextResponse.json({ success: true });
}

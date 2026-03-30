import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { sendCommunication } from '@/lib/communications';
import { requireCronAuthorisation } from '@/lib/cron-auth';

/**
 * GET/POST /api/cron/dietary-digest
 * Vercel Cron uses GET; POST kept for manual triggers.
 * Sends a morning dietary digest email to the venue's kitchen_email.
 */
export async function GET(request: NextRequest) {
  return POST(request);
}

export async function POST(request: NextRequest) {
  const denied = requireCronAuthorisation(request);
  if (denied) return denied;

  try {
    const supabase = getSupabaseAdminClient();
    const today = new Date().toISOString().slice(0, 10);

    const { data: venues } = await supabase
      .from('venues')
      .select('id, name, kitchen_email, timezone')
      .not('kitchen_email', 'is', null);

    let sent = 0;

    for (const venue of venues ?? []) {
      if (!venue.kitchen_email) continue;

      const { data: bookings } = await supabase
        .from('bookings')
        .select('id, booking_time, party_size, dietary_notes, guest_id')
        .eq('venue_id', venue.id)
        .eq('booking_date', today)
        .in('status', ['Confirmed', 'Pending', 'Seated'])
        .not('dietary_notes', 'is', null)
        .order('booking_time', { ascending: true });

      if (!bookings || bookings.length === 0) continue;

      const lines: string[] = [];
      for (const b of bookings) {
        const time = typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '?';
        const { data: guest } = await supabase.from('guests').select('name').eq('id', b.guest_id).single();
        const guestName = guest?.name ?? 'Guest';
        lines.push(`${time} — ${guestName} (${b.party_size} covers): ${b.dietary_notes}`);
      }

      const dietarySummary = lines.join('\n');

      await sendCommunication({
        type: 'dietary_digest',
        venue_id: venue.id,
        recipient: { email: venue.kitchen_email },
        payload: {
          venue_name: venue.name,
          booking_date: today,
          dietary_summary: dietarySummary,
          dietary_count: String(bookings.length),
        },
      });
      sent++;
    }

    return NextResponse.json({ sent });
  } catch (err) {
    console.error('dietary-digest failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

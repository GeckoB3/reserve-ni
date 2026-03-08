import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEKDAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** GET /api/venue/dashboard-home — summary data for the dashboard home page */
export async function GET() {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

    const admin = getSupabaseAdminClient();
    const today = new Date();
    const todayStr = formatDate(today);

    const weekEnd = new Date(today);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const weekEndStr = formatDate(weekEnd);

    const [todayBookingsRes, weekBookingsRes, venueRes] = await Promise.all([
      admin
        .from('bookings')
        .select('id, booking_time, party_size, status, deposit_amount_pence')
        .eq('venue_id', staff.venue_id)
        .eq('booking_date', todayStr)
        .in('status', ['Confirmed', 'Pending', 'Seated']),
      admin
        .from('bookings')
        .select('id, booking_date, party_size, status, deposit_amount_pence')
        .eq('venue_id', staff.venue_id)
        .gte('booking_date', todayStr)
        .lte('booking_date', weekEndStr)
        .in('status', ['Confirmed', 'Pending', 'Seated']),
      admin
        .from('venues')
        .select('availability_config')
        .eq('id', staff.venue_id)
        .single(),
    ]);

    const todayBookings = todayBookingsRes.data ?? [];
    const weekBookings = weekBookingsRes.data ?? [];

    const todayCovers = todayBookings.reduce((sum, b) => sum + b.party_size, 0);
    const todayBookingCount = todayBookings.length;
    const todayRevenue = todayBookings.reduce((sum, b) => sum + (b.deposit_amount_pence ?? 0), 0) / 100;

    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    let nextBooking: { time: string; party_size: number } | null = null;
    for (const b of todayBookings.sort((a, b) => a.booking_time.localeCompare(b.booking_time))) {
      const [h, m] = b.booking_time.split(':').map(Number);
      if (h! * 60 + m! > nowMin) {
        nextBooking = { time: b.booking_time.slice(0, 5), party_size: b.party_size };
        break;
      }
    }

    const forecast: Array<{ date: string; day: string; covers: number; bookings: number }> = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(today);
      d.setDate(d.getDate() + i);
      const dateStr = formatDate(d);
      const dayBookings = weekBookings.filter((b) => b.booking_date === dateStr);
      forecast.push({
        date: dateStr,
        day: WEEKDAYS_SHORT[d.getDay()]!,
        covers: dayBookings.reduce((sum, b) => sum + b.party_size, 0),
        bookings: dayBookings.length,
      });
    }

    const config = venueRes.data?.availability_config as { max_covers_by_day?: Record<string, number> } | null;
    const defaultMaxCovers = config?.max_covers_by_day
      ? Math.max(...Object.values(config.max_covers_by_day))
      : 40;

    const heatmap: Array<{ date: string; day: string; fillPercent: number; covers: number }> = forecast.map((f) => ({
      date: f.date,
      day: f.day,
      fillPercent: defaultMaxCovers > 0 ? Math.min(100, Math.round((f.covers / defaultMaxCovers) * 100)) : 0,
      covers: f.covers,
    }));

    const alerts: Array<{ type: string; message: string }> = [];
    const todayFill = heatmap[0];
    if (todayFill && todayFill.fillPercent >= 80) {
      alerts.push({ type: 'warning', message: `Today is ${todayFill.fillPercent}% booked — consider reducing walk-ins.` });
    }
    if (todayBookings.some((b) => b.status === 'Pending')) {
      const pendingCount = todayBookings.filter((b) => b.status === 'Pending').length;
      alerts.push({ type: 'info', message: `${pendingCount} pending booking${pendingCount > 1 ? 's' : ''} awaiting payment.` });
    }
    const tomorrow = forecast[1];
    if (tomorrow && tomorrow.bookings === 0) {
      alerts.push({ type: 'info', message: `No bookings yet for tomorrow (${tomorrow.day}).` });
    }

    return NextResponse.json({
      today: {
        covers: todayCovers,
        bookings: todayBookingCount,
        revenue: todayRevenue,
        next_booking: nextBooking,
      },
      forecast,
      heatmap,
      alerts,
      recent_bookings: todayBookings.slice(0, 10).map((b) => ({
        id: b.id,
        time: typeof b.booking_time === 'string' ? b.booking_time.slice(0, 5) : '',
        party_size: b.party_size,
        status: b.status,
      })),
    });
  } catch (err) {
    console.error('GET /api/venue/dashboard-home failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

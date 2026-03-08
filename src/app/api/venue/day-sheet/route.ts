import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getAvailableSlots } from '@/lib/availability';
import { timeToMinutes } from '@/lib/availability';
import type { VenueForAvailability } from '@/types/availability';
import { nowInVenueTz, dietarySummary } from '@/lib/day-sheet';

export interface DaySheetBooking {
  id: string;
  booking_time: string;
  party_size: number;
  status: string;
  source: string;
  deposit_status: string;
  dietary_notes: string | null;
  occasion: string | null;
  guest_name: string;
}

export interface DaySheetGroup {
  key: string;
  label: string;
  bookings: DaySheetBooking[];
}

/**
 * GET /api/venue/day-sheet?date=YYYY-MM-DD
 * Returns a day's service periods for the venue: groups, summary, dietary.
 * If no date is provided, uses the current date in the venue's timezone.
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const { data: venue, error: venueErr } = await staff.db
      .from('venues')
      .select('id, name, opening_hours, availability_config, timezone')
      .eq('id', staff.venue_id)
      .single();

    if (venueErr || !venue) {
      return NextResponse.json({ error: 'Venue not found' }, { status: 500 });
    }

    const tz = (venue.timezone as string) ?? 'Europe/London';
    const now = nowInVenueTz(tz);

    const requestedDate = request.nextUrl.searchParams.get('date');
    const dateStr = requestedDate && /^\d{4}-\d{2}-\d{2}$/.test(requestedDate) ? requestedDate : now.dateStr;
    const isToday = dateStr === now.dateStr;
    const minutesSinceMidnight = isToday ? now.minutesSinceMidnight : 0;

    const venueForAvail: VenueForAvailability = {
      id: venue.id,
      opening_hours: venue.opening_hours,
      availability_config: venue.availability_config,
      timezone: tz,
    };

    const slots = getAvailableSlots(venueForAvail, dateStr, []);

    const { data: bookingRows, error: bookErr } = await staff.db
      .from('bookings')
      .select('id, booking_date, booking_time, party_size, status, source, deposit_status, deposit_amount_pence, dietary_notes, occasion, guest_id')
      .eq('venue_id', staff.venue_id)
      .eq('booking_date', dateStr);

    if (bookErr) {
      console.error('GET /api/venue/day-sheet bookings failed:', bookErr);
      return NextResponse.json({ error: 'Failed to load bookings' }, { status: 500 });
    }

    const timeStr = (t: string) => (typeof t === 'string' ? t.slice(0, 5) : '12:00');
    const allBookings = bookingRows ?? [];

    const guestIds = [...new Set(allBookings.map((r: { guest_id: string }) => r.guest_id))];
    const { data: guestsRows } = guestIds.length
      ? await staff.db.from('guests').select('id, name').in('id', guestIds)
      : { data: [] };
    const guestsMap = new Map((guestsRows ?? []).map((g: { id: string; name: string | null }) => [g.id, g.name]));

    function toSheetBooking(r: Record<string, unknown> & { guest_id: string }): DaySheetBooking {
      return {
        id: r.id as string,
        booking_time: timeStr(r.booking_time as string),
        party_size: r.party_size as number,
        status: r.status as string,
        source: r.source as string,
        deposit_status: r.deposit_status as string,
        dietary_notes: (r.dietary_notes as string | null) ?? null,
        occasion: (r.occasion as string | null) ?? null,
        guest_name: (guestsMap.get(r.guest_id) || '').trim() || 'Walk-in',
      };
    }

    let groups: DaySheetGroup[];
    let periodKey: string | null = null;
    let periodLabel: string | null = null;
    let periodEndsAt: string | null = null;

    if (slots.length === 0) {
      const mapped = allBookings
        .map((r: Record<string, unknown> & { guest_id: string }) => toSheetBooking(r))
        .sort((a, b) => a.booking_time.localeCompare(b.booking_time));
      groups = mapped.length > 0 ? [{ key: 'all', label: 'All Bookings', bookings: mapped }] : [];
    } else if (isToday) {
      const slotStarts = slots.map((s) => timeToMinutes(s.start_time));
      const slotEnds = slots.map((s) => timeToMinutes(s.end_time));
      let periodIndex = 0;
      for (let i = 0; i < slots.length; i++) {
        if (minutesSinceMidnight >= slotStarts[i]! && minutesSinceMidnight < slotEnds[i]!) {
          periodIndex = i;
          break;
        }
        if (minutesSinceMidnight < slotStarts[i]!) {
          periodIndex = i;
          break;
        }
        periodIndex = i;
      }
      const period = slots[periodIndex]!;
      periodKey = period.key;
      periodLabel = period.label;
      periodEndsAt = `${dateStr}T${period.end_time}:00`;

      const periodStartMin = timeToMinutes(period.start_time);
      const periodEndMin = timeToMinutes(period.end_time);
      const inPeriod = allBookings.filter((b: { booking_time: string }) => {
        const m = timeToMinutes(timeStr(b.booking_time));
        return m >= periodStartMin && m < periodEndMin;
      });
      const mapped = inPeriod
        .map((r: Record<string, unknown> & { guest_id: string }) => toSheetBooking(r))
        .sort((a, b) => b.party_size - a.party_size);
      groups = [{ key: period.key, label: period.label, bookings: mapped }];
    } else {
      groups = slots.map((period) => {
        const periodStartMin = timeToMinutes(period.start_time);
        const periodEndMin = timeToMinutes(period.end_time);
        const inPeriod = allBookings.filter((b: { booking_time: string }) => {
          const m = timeToMinutes(timeStr(b.booking_time));
          return m >= periodStartMin && m < periodEndMin;
        });
        return {
          key: period.key,
          label: period.label,
          bookings: inPeriod
            .map((r: Record<string, unknown> & { guest_id: string }) => toSheetBooking(r))
            .sort((a, b) => a.booking_time.localeCompare(b.booking_time)),
        };
      }).filter((g) => g.bookings.length > 0);
      periodLabel = `${slots.length} service period${slots.length !== 1 ? 's' : ''}`;
    }

    const allForStats = allBookings as Array<{ party_size: number; status: string }>;
    const coversExpected = allForStats
      .filter((b) => ['Confirmed', 'Pending', 'Seated'].includes(b.status))
      .reduce((s, b) => s + b.party_size, 0);
    const seated = allForStats
      .filter((b) => ['Seated', 'Completed'].includes(b.status))
      .reduce((s, b) => s + b.party_size, 0);
    const noShows = allForStats
      .filter((b) => b.status === 'No-Show')
      .reduce((s, b) => s + b.party_size, 0);
    const cancellations = allForStats
      .filter((b) => b.status === 'Cancelled')
      .reduce((s, b) => s + b.party_size, 0);

    const dietary = dietarySummary(
      allBookings.map((b: { dietary_notes: string | null; occasion: string | null }) => ({
        dietary_notes: b.dietary_notes,
        occasion: b.occasion,
      }))
    );

    return NextResponse.json({
      date: dateStr,
      periodKey,
      periodLabel,
      periodEndsAt,
      groups,
      summary: { coversExpected, seated, noShows, cancellations },
      dietarySummary: dietary,
    });
  } catch (err) {
    console.error('GET /api/venue/day-sheet failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

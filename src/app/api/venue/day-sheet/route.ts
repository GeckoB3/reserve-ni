import { NextResponse } from 'next/server';
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
 * GET /api/venue/day-sheet
 * Returns today's current or next service period for the venue: groups, summary, dietary.
 * Uses venue timezone for "today" and current time.
 */
export async function GET() {
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
    const { dateStr, minutesSinceMidnight } = nowInVenueTz(tz);

    const venueForAvail: VenueForAvailability = {
      id: venue.id,
      opening_hours: venue.opening_hours,
      availability_config: venue.availability_config,
      timezone: tz,
    };

    const slots = getAvailableSlots(venueForAvail, dateStr, []);
    if (slots.length === 0) {
      return NextResponse.json({
        date: dateStr,
        periodKey: null,
        periodLabel: null,
        periodEndsAt: null,
        groups: [],
        summary: { coversExpected: 0, seated: 0, noShows: 0, cancellations: 0 },
        dietarySummary: [],
      });
    }

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
    const periodStartMin = timeToMinutes(period.start_time);
    const periodEndMin = timeToMinutes(period.end_time);

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
    const bookingInPeriod = (b: { booking_time: string }) => {
      const m = timeToMinutes(timeStr(b.booking_time));
      return m >= periodStartMin && m < periodEndMin;
    };

    const inPeriod = (bookingRows ?? []).filter(bookingInPeriod);
    const guestIds = [...new Set(inPeriod.map((r: { guest_id: string }) => r.guest_id))];
    const { data: guestsRows } = guestIds.length
      ? await staff.db.from('guests').select('id, name').in('id', guestIds)
      : { data: [] };
    const guestsMap = new Map((guestsRows ?? []).map((g: { id: string; name: string | null }) => [g.id, g.name]));

    const bookingsForGroup: DaySheetBooking[] = inPeriod
      .map((r: Record<string, unknown> & { guest_id: string }) => ({
        id: r.id as string,
        booking_time: timeStr(r.booking_time as string),
        party_size: r.party_size as number,
        status: r.status as string,
        source: r.source as string,
        deposit_status: r.deposit_status as string,
        dietary_notes: (r.dietary_notes as string | null) ?? null,
        occasion: (r.occasion as string | null) ?? null,
        guest_name: (guestsMap.get(r.guest_id) || '').trim() || 'Walk-in',
      }))
      .sort((a, b) => b.party_size - a.party_size);

    const groups: DaySheetGroup[] = [
      { key: period.key, label: period.label, bookings: bookingsForGroup },
    ];

    const allInPeriod = inPeriod as Array<{ party_size: number; status: string }>;
    const coversExpected = allInPeriod
      .filter((b) => ['Confirmed', 'Pending', 'Seated'].includes(b.status))
      .reduce((s, b) => s + b.party_size, 0);
    const seated = allInPeriod
      .filter((b) => ['Seated', 'Completed'].includes(b.status))
      .reduce((s, b) => s + b.party_size, 0);
    const noShows = allInPeriod
      .filter((b) => b.status === 'No-Show')
      .reduce((s, b) => s + b.party_size, 0);
    const cancellations = allInPeriod
      .filter((b) => b.status === 'Cancelled')
      .reduce((s, b) => s + b.party_size, 0);

    const periodEndsAt = `${dateStr}T${period.end_time}:00`;
    const dietary = dietarySummary(
      inPeriod.map((b: { dietary_notes: string | null; occasion: string | null }) => ({
        dietary_notes: b.dietary_notes,
        occasion: b.occasion,
      }))
    );

    return NextResponse.json({
      date: dateStr,
      periodKey: period.key,
      periodLabel: period.label,
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

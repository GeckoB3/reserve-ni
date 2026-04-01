import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getVenueStaff } from '@/lib/venue-auth';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { replaceBookingAssignments, syncTableStatusesForBooking } from '@/lib/table-management/lifecycle';
import { resolvePartySizeBoundsForVenueServices } from '@/lib/booking/party-size-bounds';
import { resolveVenueMode } from '@/lib/venue-mode';
import { isUnifiedSchedulingVenue } from '@/lib/booking/unified-scheduling';
import { z } from 'zod';
import { normalizeToE164 } from '@/lib/phone/e164';

const walkInSchema = z.object({
  party_size: z.number().int().min(1).max(50),
  name: z.string().max(200).optional(),
  phone: z.string().max(24).optional(),
  dietary_notes: z.string().max(500).optional(),
  occasion: z.string().max(200).optional(),
  table_id: z.string().uuid().optional(),
  table_ids: z.array(z.string().uuid()).optional(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  booking_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/).optional(),
  practitioner_id: z.string().uuid().optional(),
  appointment_service_id: z.string().uuid().optional(),
  email: z.union([z.literal(''), z.string().email()]).optional(),
});

function venueLocalDateTime(timezone: string): { date: string; hours: number; minutes: number } {
  const now = new Date();
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    hours: Number(get('hour')),
    minutes: Number(get('minute')),
  };
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.slice(0, 5).split(':').map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}

function extractTime(value: string): string {
  if (value.includes('T')) {
    return (value.split('T')[1] ?? '').slice(0, 5);
  }
  return value.slice(0, 5);
}

/** Wall-clock end time (HH:MM:SS) from a start time and duration; does not enforce bookable slots. */
function addMinutesToBookingEnd(startHhMmSs: string, addMins: number): string {
  const [h, m] = startHhMmSs.slice(0, 5).split(':').map(Number);
  const total = (h ?? 0) * 60 + (m ?? 0) + addMins;
  const hh = Math.floor(total / 60) % 24;
  const mm = total % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}:00`;
}

/**
 * POST /api/venue/bookings/walk-in
 * Quick add walk-in: source walk-in, status Seated, no deposit.
 * Body: { party_size, name? }. Uses today's date and current venue-local time.
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

    const {
      party_size,
      name,
      phone,
      email: rawEmail,
      dietary_notes,
      occasion,
      table_id,
      table_ids: rawTableIds,
      booking_date,
      booking_time,
    } = parsed.data;

    let phoneE164: string | null = null;
    if (phone?.trim()) {
      const n = normalizeToE164(phone.trim(), 'GB');
      if (!n) {
        return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      }
      phoneE164 = n;
    }

    const admin = getSupabaseAdminClient();
    const venueMode = await resolveVenueMode(admin, staff.venue_id);

    // --- Model B: Appointment walk-in ---
    if (isUnifiedSchedulingVenue(venueMode.bookingModel)) {
      const { practitioner_id, appointment_service_id } = parsed.data;
      if (!practitioner_id || !appointment_service_id) {
        return NextResponse.json(
          { error: 'practitioner_id and appointment_service_id are required for appointment walk-ins' },
          { status: 400 },
        );
      }

      const { data: pracCheck } = await admin
        .from('practitioners')
        .select('id')
        .eq('id', practitioner_id)
        .eq('venue_id', staff.venue_id)
        .eq('is_active', true)
        .single();
      if (!pracCheck) {
        return NextResponse.json({ error: 'Practitioner not found or inactive' }, { status: 400 });
      }

      const { data: venueRow } = await admin
        .from('venues')
        .select('timezone')
        .eq('id', staff.venue_id)
        .single();
      const tz = venueRow?.timezone ?? 'Europe/London';
      const localNow = venueLocalDateTime(tz);
      const today = parsed.data.booking_date ?? localNow.date;
      const exactTime = `${String(localNow.hours).padStart(2, '0')}:${String(localNow.minutes).padStart(2, '0')}:00`;
      const walkInTime = parsed.data.booking_time
        ? (parsed.data.booking_time.length === 5 ? `${parsed.data.booking_time}:00` : parsed.data.booking_time)
        : exactTime;

      const { data: svc } = await admin
        .from('appointment_services')
        .select('duration_minutes')
        .eq('id', appointment_service_id)
        .eq('venue_id', staff.venue_id)
        .single();
      if (!svc) {
        return NextResponse.json({ error: 'Appointment service not found' }, { status: 400 });
      }
      const durationMins = svc.duration_minutes;

      // Walk-ins use the venue-local moment of confirmation, not the public availability grid.
      const bookingEndTime = addMinutesToBookingEnd(walkInTime, durationMins);
      const emailNorm = rawEmail?.trim() ? rawEmail.trim().toLowerCase() : null;
      const estimatedEndIso = (() => {
        const d = new Date(`${today}T${bookingEndTime.slice(0, 5)}:00`);
        return Number.isNaN(d.getTime()) ? null : d.toISOString();
      })();

      const { data: apptGuest, error: apptGuestErr } = await admin
        .from('guests')
        .insert({
          venue_id: staff.venue_id,
          name: name?.trim() || 'Walk-in',
          email: emailNorm,
          phone: phoneE164,
          visit_count: 1,
        })
        .select('id')
        .single();

      if (apptGuestErr) {
        console.error('Walk-in guest insert failed:', apptGuestErr);
        return NextResponse.json({ error: 'Failed to create guest' }, { status: 500 });
      }

      const { data: apptBooking, error: apptBookErr } = await admin
        .from('bookings')
        .insert({
          venue_id: staff.venue_id,
          guest_id: apptGuest.id,
          booking_date: today,
          booking_time: walkInTime,
          booking_end_time: bookingEndTime,
          party_size: 1,
          status: 'Seated',
          source: 'walk-in',
          deposit_status: 'Not Required',
          dietary_notes: dietary_notes?.trim() || null,
          occasion: occasion?.trim() || null,
          practitioner_id,
          appointment_service_id,
          estimated_end_time: estimatedEndIso,
        })
        .select('id, booking_date, booking_time, booking_end_time, party_size, status, source')
        .single();

      if (apptBookErr) {
        console.error('Walk-in appointment insert failed:', apptBookErr);
        return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
      }

      return NextResponse.json(apptBooking, { status: 201 });
    }

    // --- Model A: Table walk-in ---
    const { min: minPartyWalkIn, max: maxPartyWalkIn } = await resolvePartySizeBoundsForVenueServices(
      admin,
      staff.venue_id,
    );
    if (party_size < minPartyWalkIn || party_size > maxPartyWalkIn) {
      return NextResponse.json(
        { error: `Party size must be between ${minPartyWalkIn} and ${maxPartyWalkIn}` },
        { status: 400 },
      );
    }

    const { data: venueSettings } = await admin
      .from('venues')
      .select('timezone, table_management_enabled')
      .eq('id', staff.venue_id)
      .single();
    const timezone = venueSettings?.timezone ?? 'Europe/London';
    const coversOnly = !(venueSettings?.table_management_enabled);
    const localNow = venueLocalDateTime(timezone);
    const today = booking_date ?? localNow.date;
    const exactTime = `${String(localNow.hours).padStart(2, '0')}:${String(localNow.minutes).padStart(2, '0')}:00`;
    const bookingTime = booking_time ? (booking_time.length === 5 ? `${booking_time}:00` : booking_time) : exactTime;

    const resolvedTableIds = rawTableIds ?? (table_id ? [table_id] : []);

    if (table_id && !coversOnly) {
      const { data: tableCheck } = await admin
        .from('venue_tables')
        .select('id, max_covers')
        .eq('id', table_id)
        .eq('venue_id', staff.venue_id)
        .single();

      if (!tableCheck) {
        return NextResponse.json({ error: 'Table not found or does not belong to this venue' }, { status: 400 });
      }

      if (party_size > tableCheck.max_covers) {
        return NextResponse.json({ error: `Party of ${party_size} exceeds table capacity (max ${tableCheck.max_covers})` }, { status: 400 });
      }

      const bookingStartMinutes = timeToMinutes(bookingTime);
      const bookingEndMinutes = bookingStartMinutes + 90;

      const { data: existingAssignments } = await admin
        .from('booking_table_assignments')
        .select('booking_id, bookings!inner(booking_date, booking_time, estimated_end_time, status)')
        .eq('table_id', table_id)
        .eq('bookings.booking_date', today);
      const hasBookingConflict = (existingAssignments ?? []).some((assignment: {
        bookings:
          | {
              booking_date: string | null;
              booking_time: string | null;
              estimated_end_time: string | null;
              status: string | null;
            }
          | Array<{
              booking_date: string | null;
              booking_time: string | null;
              estimated_end_time: string | null;
              status: string | null;
            }>
          | null;
      }) => {
        const details = Array.isArray(assignment.bookings) ? assignment.bookings[0] : assignment.bookings;
        if (!details || !details.booking_time || !details.status) return false;
        if (!['Pending', 'Confirmed', 'Seated'].includes(details.status)) return false;
        const existingStart = timeToMinutes(extractTime(details.booking_time));
        const existingEnd = details.estimated_end_time
          ? timeToMinutes(extractTime(details.estimated_end_time))
          : existingStart + 90;
        return bookingStartMinutes < existingEnd && bookingEndMinutes > existingStart;
      });
      if (hasBookingConflict) {
        return NextResponse.json({ error: 'Selected table is already occupied at that time' }, { status: 409 });
      }

      const dayStart = `${today}T00:00:00.000Z`;
      const dayEnd = `${today}T23:59:59.999Z`;
      const { data: existingBlocks } = await admin
        .from('table_blocks')
        .select('start_at, end_at')
        .eq('table_id', table_id)
        .lt('start_at', dayEnd)
        .gt('end_at', dayStart);
      const hasBlockConflict = (existingBlocks ?? []).some((block: { start_at: string; end_at: string }) => {
        const existingStart = timeToMinutes(new Date(block.start_at).toISOString().slice(11, 16));
        const existingEnd = timeToMinutes(new Date(block.end_at).toISOString().slice(11, 16));
        return bookingStartMinutes < existingEnd && bookingEndMinutes > existingStart;
      });
      if (hasBlockConflict) {
        return NextResponse.json({ error: 'Selected table is blocked at that time' }, { status: 409 });
      }
    }

    const { data: guest, error: guestErr } = await admin
      .from('guests')
      .insert({
        venue_id: staff.venue_id,
        name: name?.trim() || 'Walk-in',
        email: null,
        phone: phoneE164,
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
        dietary_notes: dietary_notes?.trim() || null,
        occasion: occasion?.trim() || null,
      })
      .select('id, booking_date, booking_time, party_size, status, source')
      .single();

    if (bookErr) {
      console.error('Walk-in booking insert failed:', bookErr);
      return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
    }

    if (resolvedTableIds.length > 0) {
      await replaceBookingAssignments(admin, booking.id, resolvedTableIds, staff.id);
      await syncTableStatusesForBooking(admin, booking.id, resolvedTableIds, 'Seated', staff.id);
    }

    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    console.error('POST /api/venue/bookings/walk-in failed:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

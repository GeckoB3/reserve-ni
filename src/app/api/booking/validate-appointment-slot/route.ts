import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { resolveVenueMode } from '@/lib/venue-mode';
import {
  attachVenueClockToAppointmentInput,
  fetchAppointmentInput,
  validateExactAppointmentStart,
  type PhantomBooking,
} from '@/lib/availability/appointment-engine';
import { z } from 'zod';

const phantomSchema = z.object({
  practitioner_id: z.string().uuid(),
  start_time: z.string(),
  duration_minutes: z.number().int().min(1),
  buffer_minutes: z.number().int().min(0),
});

const bodySchema = z.object({
  venue_id: z.string().uuid(),
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  practitioner_id: z.string().uuid(),
  service_id: z.string().uuid(),
  start_time: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9](:[0-5][0-9])?$/),
  phantoms: z.array(phantomSchema).optional(),
});

/**
 * POST /api/booking/validate-appointment-slot
 * Checks a single exact start time (for multi-service consecutive slots).
 */
export async function POST(request: NextRequest) {
  try {
    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    }

    const { venue_id, booking_date, practitioner_id, service_id, start_time, phantoms } = parsed.data;
    const supabase = getSupabaseAdminClient();

    const venueMode = await resolveVenueMode(supabase, venue_id);
    if (venueMode.bookingModel !== 'practitioner_appointment') {
      return NextResponse.json({ ok: false, error: 'Not an appointment venue' }, { status: 400 });
    }

    const { data: venue } = await supabase
      .from('venues')
      .select('timezone, booking_rules, opening_hours')
      .eq('id', venue_id)
      .single();

    if (!venue) {
      return NextResponse.json({ ok: false, error: 'Venue not found' }, { status: 404 });
    }

    const input = await fetchAppointmentInput({
      supabase,
      venueId: venue_id,
      date: booking_date,
      practitionerId: practitioner_id,
      serviceId: service_id,
    });
    input.phantomBookings = (phantoms ?? []) as PhantomBooking[];

    attachVenueClockToAppointmentInput(input, venue as { timezone?: string | null; booking_rules?: unknown; opening_hours?: unknown });

    const timeStr = start_time.slice(0, 5);
    const result = validateExactAppointmentStart(input, practitioner_id, service_id, timeStr);
    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.reason ?? 'Unavailable' });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('POST /api/booking/validate-appointment-slot failed:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSupabaseAdminClient } from '@/lib/supabase';
import { getVenueStaff } from '@/lib/venue-auth';
import { validateResourceBookingModification } from '@/lib/booking/validate-resource-booking-modification';
import { inferBookingRowModel } from '@/lib/booking/infer-booking-row-model';
import { loadStaffAccessibleBooking } from '@/lib/booking/staff-booking-access';

const bodySchema = z.object({
  booking_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  booking_time: z.string().min(4).max(12),
  duration_minutes: z.number().int().min(5).max(1440).optional().nullable(),
  booking_end_time: z.string().optional().nullable(),
});

/**
 * POST /api/venue/bookings/[id]/validate-resource-modification
 * Dry-run resource interval validation for staff modify UI (same engine as PATCH).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const supabase = await createClient();
    const staff = await getVenueStaff(supabase);
    if (!staff) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }

    const parsed = bodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ ok: false, error: 'Invalid request' }, { status: 400 });
    }

    const admin = getSupabaseAdminClient();
    const loaded = await loadStaffAccessibleBooking(staff, id);
    if (!loaded.ok) {
      return NextResponse.json({ error: loaded.error }, { status: loaded.status });
    }
    const { booking, ownerVenueId: scopeVenueId } = loaded.ctx;

    const inferred = inferBookingRowModel({
      booking_model: (booking as { booking_model?: string | null }).booking_model,
      experience_event_id: booking.experience_event_id as string | null | undefined,
      class_instance_id: booking.class_instance_id as string | null | undefined,
      resource_id: booking.resource_id as string | null | undefined,
      event_session_id: booking.event_session_id as string | null | undefined,
      calendar_id: booking.calendar_id as string | null | undefined,
      service_item_id: booking.service_item_id as string | null | undefined,
      practitioner_id: booking.practitioner_id as string | null | undefined,
      appointment_service_id: booking.appointment_service_id as string | null | undefined,
    });
    if (inferred !== 'resource_booking') {
      return NextResponse.json({ ok: false, error: 'Not a resource booking' }, { status: 400 });
    }

    const resourceId = booking.resource_id as string | null;
    if (!resourceId) {
      return NextResponse.json({ ok: false, error: 'Booking is missing resource_id' }, { status: 400 });
    }

    const timeStr =
      parsed.data.booking_time.length >= 5 ? parsed.data.booking_time.slice(0, 5) : parsed.data.booking_time;

    const result = await validateResourceBookingModification({
      admin,
      venueId: scopeVenueId,
      bookingId: id,
      resourceId,
      newDate: parsed.data.booking_date,
      timeStr,
      durationMinutes: parsed.data.duration_minutes,
      bookingEndTime: parsed.data.booking_end_time,
    });

    if (!result.ok) {
      return NextResponse.json({ ok: false, error: result.reason });
    }

    return NextResponse.json({ ok: true, duration_minutes: result.durationMinutes, booking_end_time: result.endHHmm });
  } catch (err) {
    console.error('POST validate-resource-modification failed:', err);
    return NextResponse.json({ ok: false, error: 'Server error' }, { status: 500 });
  }
}

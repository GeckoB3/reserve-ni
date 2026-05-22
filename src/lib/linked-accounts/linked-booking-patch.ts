import { getSupabaseAdminClient } from '@/lib/supabase';
import { estimatedEndIsoFromSchedule } from '@/lib/booking/booking-detail-from-row';
import { venueUsesUnifiedCalendarList } from '@/lib/booking/unified-calendar-list';

export interface LinkedBookingPatchSourceRow {
  venue_id: string;
  calendar_id: string | null;
  practitioner_id: string | null;
  booking_date: string;
  booking_time: string;
  booking_end_time: string | null;
}

/** Map staff PATCH fields to linked_apply_booking_update RPC shape (unified calendar columns). */
export async function normalizeLinkedBookingRpcChanges(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  booking: LinkedBookingPatchSourceRow,
  changes: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { ...changes };
  const ownerUsesUnified = await venueUsesUnifiedCalendarList(admin, booking.venue_id);

  if (out.practitioner_id !== undefined && out.practitioner_id !== null) {
    if (booking.calendar_id || ownerUsesUnified) {
      out.calendar_id = out.practitioner_id;
      delete out.practitioner_id;
    }
  }

  if (out.booking_date !== undefined || out.booking_time !== undefined || out.booking_end_time !== undefined) {
    const date = (out.booking_date as string) ?? booking.booking_date;
    const timeRaw =
      (out.booking_time as string) ??
      (typeof booking.booking_time === 'string' ? booking.booking_time : '12:00:00');
    const timeHm = timeRaw.slice(0, 5);
    const endRaw =
      (out.booking_end_time as string) ??
      (booking.booking_end_time ? String(booking.booking_end_time) : null);
    if (endRaw) {
      const endHm = endRaw.slice(0, 5);
      out.estimated_end_time = estimatedEndIsoFromSchedule(date, timeHm, endHm);
    }
  }

  return out;
}

/**
 * Records a staff-facing waitlist alert when availability opens (staff_choose mode).
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { CancelledBookingForWaitlistOffer } from '@/lib/booking/offer-appointment-waitlist-on-cancel';
import {
  freedPractitionerId,
  freedServiceIds,
} from '@/lib/booking/offer-appointment-waitlist-on-cancel';

export interface RecordWaitlistSlotOpportunityResult {
  created: boolean;
  opportunityId?: string;
  reason?: string;
}

export interface WaitlistSlotOpportunitySlotInput {
  venue_id: string;
  slot_date: string;
  slot_time: string;
  practitioner_id?: string | null;
  calendar_id?: string | null;
  appointment_service_id?: string | null;
  service_item_id?: string | null;
  /** Cancelled booking id when known; omitted for availability sync rows. */
  source_booking_id?: string | null;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function timeForDb(bookingTime: string): string | null {
  const hm = typeof bookingTime === 'string' ? bookingTime.slice(0, 5) : '';
  if (!hm) return null;
  return `${hm}:00`;
}

function isUuid(value: string | null | undefined): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * Creates an open staff alert for a freed slot if one does not already exist.
 */
export async function recordWaitlistSlotOpportunityFromSlot(
  admin: SupabaseClient,
  slot: WaitlistSlotOpportunitySlotInput,
): Promise<RecordWaitlistSlotOpportunityResult> {
  const slotTime = timeForDb(slot.slot_time);
  if (!slotTime) {
    return { created: false, reason: 'missing_booking_time' };
  }

  const calendarId = slot.calendar_id ?? slot.practitioner_id ?? null;
  const appointmentServiceId = slot.appointment_service_id ?? null;
  const serviceItemId = slot.service_item_id ?? null;

  let existingQuery = admin
    .from('waitlist_slot_opportunities')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', slot.venue_id)
    .eq('slot_date', slot.slot_date)
    .eq('slot_time', slotTime)
    .eq('status', 'open');

  if (calendarId) {
    existingQuery = existingQuery.or(
      `calendar_id.eq.${calendarId},practitioner_id.eq.${calendarId}`,
    );
  } else {
    existingQuery = existingQuery.is('calendar_id', null).is('practitioner_id', null);
  }

  if (appointmentServiceId) {
    existingQuery = existingQuery.eq('appointment_service_id', appointmentServiceId);
  } else {
    existingQuery = existingQuery.is('appointment_service_id', null);
  }

  if (serviceItemId) {
    existingQuery = existingQuery.eq('service_item_id', serviceItemId);
  } else {
    existingQuery = existingQuery.is('service_item_id', null);
  }

  const { count: existingCount } = await existingQuery;

  if ((existingCount ?? 0) > 0) {
    return { created: false, reason: 'opportunity_already_open' };
  }

  const insertRow: Record<string, unknown> = {
    venue_id: slot.venue_id,
    slot_date: slot.slot_date,
    slot_time: slotTime,
    practitioner_id: slot.practitioner_id ?? calendarId,
    calendar_id: slot.calendar_id ?? calendarId,
    appointment_service_id: appointmentServiceId,
    service_item_id: serviceItemId,
    status: 'open',
  };

  if (isUuid(slot.source_booking_id)) {
    insertRow.source_booking_id = slot.source_booking_id;
  }

  const { data, error } = await admin
    .from('waitlist_slot_opportunities')
    .insert(insertRow)
    .select('id')
    .maybeSingle();

  if (error || !data) {
    console.error('[recordWaitlistSlotOpportunityFromSlot] insert failed:', error, {
      venueId: slot.venue_id,
      slotDate: slot.slot_date,
      slotTime,
    });
    return { created: false, reason: 'insert_failed' };
  }

  return { created: true, opportunityId: data.id as string };
}

/**
 * Creates an open staff alert from a cancelled booking.
 */
export async function recordWaitlistSlotOpportunity(
  admin: SupabaseClient,
  booking: CancelledBookingForWaitlistOffer,
): Promise<RecordWaitlistSlotOpportunityResult> {
  const serviceIds = freedServiceIds(booking);
  const calendarId = freedPractitionerId(booking);

  return recordWaitlistSlotOpportunityFromSlot(admin, {
    venue_id: booking.venue_id,
    slot_date: booking.booking_date,
    slot_time: booking.booking_time,
    practitioner_id: booking.practitioner_id ?? calendarId,
    calendar_id: booking.calendar_id ?? calendarId,
    appointment_service_id: serviceIds.appointmentServiceId,
    service_item_id: serviceIds.serviceItemId,
    source_booking_id: isUuid(booking.id) ? booking.id : null,
  });
}

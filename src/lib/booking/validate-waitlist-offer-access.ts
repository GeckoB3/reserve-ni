/**
 * Validates an active waitlist offer for guest booking / availability bypass.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { logWaitlistConvertedEvent } from '@/lib/booking/log-waitlist-converted-event';
import { markWaitlistOpportunitiesFilledForSlot } from '@/lib/booking/waitlist-slot-opportunity-service';
import { slotTimeForDb } from '@/lib/booking/waitlist-freed-slot';

export interface ActiveWaitlistOfferRow {
  id: string;
  venue_id: string;
  desired_date: string;
  desired_time: string | null;
  desired_time_end: string | null;
  practitioner_id: string | null;
  appointment_service_id: string | null;
  service_item_id: string | null;
  offered_slot_time: string | null;
  offered_calendar_id: string | null;
  expires_at: string | null;
  status: string;
}

export async function loadActiveWaitlistOfferForGuestAccess(
  admin: SupabaseClient,
  waitlistEntryId: string,
  venueId: string,
): Promise<ActiveWaitlistOfferRow | null> {
  const { data, error } = await admin
    .from('waitlist_entries')
    .select(
      'id, venue_id, desired_date, desired_time, desired_time_end, practitioner_id, appointment_service_id, service_item_id, offered_slot_time, offered_calendar_id, expires_at, status',
    )
    .eq('id', waitlistEntryId)
    .eq('venue_id', venueId)
    .eq('waitlist_kind', 'appointment')
    .in('status', ['offered', 'confirmed'])
    .maybeSingle();

  if (error) {
    console.error('[loadActiveWaitlistOfferForGuestAccess] query failed:', error, {
      waitlistEntryId,
      venueId,
    });
    return null;
  }

  if (!data) return null;

  const row = data as ActiveWaitlistOfferRow;
  if (row.expires_at && new Date(row.expires_at).getTime() <= Date.now()) {
    return null;
  }

  return row;
}

export function waitlistOfferServiceId(row: ActiveWaitlistOfferRow): string | null {
  return row.service_item_id ?? row.appointment_service_id ?? null;
}

function normalizeTimeHm(time: string): string {
  return time.trim().slice(0, 5);
}

export type WaitlistOfferBookingPayload = {
  bookingDate: string;
  bookingTimeHm: string;
  practitionerOrCalendarId: string;
  appointmentServiceId?: string | null;
  serviceItemId?: string | null;
};

export function validateBookingAgainstWaitlistOffer(
  offer: ActiveWaitlistOfferRow,
  payload: WaitlistOfferBookingPayload,
): { ok: true } | { ok: false; message: string } {
  if (payload.bookingDate !== offer.desired_date) {
    return { ok: false, message: 'Booking date does not match your waitlist offer.' };
  }

  const offerServiceId = waitlistOfferServiceId(offer);
  const requestServiceId = payload.serviceItemId ?? payload.appointmentServiceId ?? null;
  if (offerServiceId && requestServiceId && offerServiceId !== requestServiceId) {
    return { ok: false, message: 'Booking service does not match your waitlist offer.' };
  }

  const offerCalendarId = offer.offered_calendar_id ?? offer.practitioner_id;
  if (offerCalendarId && offerCalendarId !== payload.practitionerOrCalendarId) {
    return { ok: false, message: 'This practitioner does not match your waitlist offer.' };
  }

  if (offer.offered_slot_time) {
    const offerHm = normalizeTimeHm(offer.offered_slot_time);
    if (offerHm !== normalizeTimeHm(payload.bookingTimeHm)) {
      return { ok: false, message: 'Booking time does not match your waitlist offer.' };
    }
  }

  return { ok: true };
}

/** Clears offer expiry and records conversion after a guest books with a waitlist offer. */
export async function completeWaitlistEntryAfterGuestBooking(
  admin: SupabaseClient,
  params: {
    offer: ActiveWaitlistOfferRow;
    venueId: string;
    bookingId: string;
    bookingModel: string;
  },
): Promise<void> {
  const { offer, venueId, bookingId, bookingModel } = params;

  const { error: updateErr } = await admin
    .from('waitlist_entries')
    .update({
      expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', offer.id)
    .eq('venue_id', venueId)
    .in('status', ['offered', 'confirmed']);

  if (updateErr) {
    console.error('[completeWaitlistEntryAfterGuestBooking] update failed:', updateErr, {
      waitlistEntryId: offer.id,
      bookingId,
    });
  }

  await logWaitlistConvertedEvent(admin, {
    venueId,
    bookingId,
    waitlistEntryId: offer.id,
    waitlistKind: 'appointment',
    bookingModel,
  });

  const slotTime = offer.offered_slot_time ?? offer.desired_time;
  if (!slotTime) return;

  await markWaitlistOpportunitiesFilledForSlot(admin, {
    venueId,
    slotDate: offer.desired_date,
    slotTime: slotTimeForDb(slotTime),
    calendarId: offer.offered_calendar_id ?? offer.practitioner_id,
    appointmentServiceId: offer.appointment_service_id,
    serviceItemId: offer.service_item_id,
  });
}

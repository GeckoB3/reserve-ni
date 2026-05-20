/**
 * Offers a waitlist entry in notify_in_order mode and notifies the guest.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyAppointmentWaitlistOfferForEntry } from '@/lib/booking/notify-appointment-waitlist-offer';
import {
  APPOINTMENT_WAITLIST_COMPLETED_STATUS,
  APPOINTMENT_WAITLIST_OFFER_TTL_MS,
} from '@/lib/booking/waitlist-offer-constants';
import type { WaitlistEntryCandidate } from '@/lib/booking/offer-appointment-waitlist-on-cancel';
import {
  slotTimeForDb,
  type WaitlistFreedSlotContext,
} from '@/lib/booking/waitlist-freed-slot';
import { wasWaitlistOfferNotifySuccessful } from '@/lib/booking/waitlist-offer-notify-success';

export type OfferWaitlistEntryInOrderResult =
  | {
      ok: true;
      waitlistEntryId: string;
      emailSent: boolean;
      smsSent: boolean;
    }
  | {
      ok: false;
      reason: string;
    };

export async function hasActiveWaitlistOfferForSlot(
  admin: SupabaseClient,
  venueId: string,
  slotDate: string,
  slotTime: string,
  calendarId: string | null,
): Promise<boolean> {
  const timeForDb = slotTimeForDb(slotTime);
  const nowIso = new Date().toISOString();

  const applyCalendarFilter = <T extends { eq: (col: string, val: string) => T; is: (col: string, val: null) => T }>(
    query: T,
  ): T => (calendarId ? query.eq('offered_calendar_id', calendarId) : query.is('offered_calendar_id', null));

  let offeredQuery = admin
    .from('waitlist_entries')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('waitlist_kind', 'appointment')
    .eq('status', 'offered')
    .eq('desired_date', slotDate)
    .eq('offered_slot_time', timeForDb);
  offeredQuery = applyCalendarFilter(offeredQuery);
  const { count: offeredCount } = await offeredQuery;
  if ((offeredCount ?? 0) > 0) return true;

  let timedConfirmedQuery = admin
    .from('waitlist_entries')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('waitlist_kind', 'appointment')
    .eq('status', APPOINTMENT_WAITLIST_COMPLETED_STATUS)
    .eq('desired_date', slotDate)
    .eq('offered_slot_time', timeForDb)
    .not('expires_at', 'is', null)
    .gt('expires_at', nowIso);
  timedConfirmedQuery = applyCalendarFilter(timedConfirmedQuery);
  const { count: timedConfirmedCount } = await timedConfirmedQuery;
  if ((timedConfirmedCount ?? 0) > 0) return true;

  // Legacy rows before offered_slot_time tracking: fall back to desired_time match.
  let legacyOfferedQuery = admin
    .from('waitlist_entries')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('waitlist_kind', 'appointment')
    .eq('status', 'offered')
    .eq('desired_date', slotDate)
    .eq('desired_time', timeForDb)
    .is('offered_slot_time', null);
  legacyOfferedQuery = applyCalendarFilter(legacyOfferedQuery);
  const { count: legacyOfferedCount } = await legacyOfferedQuery;
  if ((legacyOfferedCount ?? 0) > 0) return true;

  let legacyTimedConfirmedQuery = admin
    .from('waitlist_entries')
    .select('id', { count: 'exact', head: true })
    .eq('venue_id', venueId)
    .eq('waitlist_kind', 'appointment')
    .eq('status', APPOINTMENT_WAITLIST_COMPLETED_STATUS)
    .eq('desired_date', slotDate)
    .eq('desired_time', timeForDb)
    .is('offered_slot_time', null)
    .not('expires_at', 'is', null)
    .gt('expires_at', nowIso);
  legacyTimedConfirmedQuery = applyCalendarFilter(legacyTimedConfirmedQuery);
  const { count: legacyTimedConfirmedCount } = await legacyTimedConfirmedQuery;
  return (legacyTimedConfirmedCount ?? 0) > 0;
}

export async function offerWaitlistEntryInOrder(
  admin: SupabaseClient,
  slot: WaitlistFreedSlotContext,
  match: WaitlistEntryCandidate,
): Promise<OfferWaitlistEntryInOrderResult> {
  const timeForDb = slotTimeForDb(slot.slotTime);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + APPOINTMENT_WAITLIST_OFFER_TTL_MS).toISOString();

  const notify = await notifyAppointmentWaitlistOfferForEntry(
    admin,
    slot.venueId,
    {
      waitlistEntryId: match.id,
      desired_date: slot.slotDate,
      desired_time: match.desired_time ?? timeForDb,
      desired_time_end: match.desired_time_end ?? null,
      guest_first_name: match.guest_first_name,
      guest_last_name: match.guest_last_name,
      guest_email: match.guest_email,
      guest_phone: match.guest_phone,
      offered_slot_time: timeForDb,
      offered_calendar_id: slot.calendarId,
      appointment_service_id: match.appointment_service_id,
      service_item_id: match.service_item_id,
    },
    expiresAt,
  );

  if (!wasWaitlistOfferNotifySuccessful(notify)) {
    console.warn('[offerWaitlistEntryInOrder] guest was not notified', {
      waitlistEntryId: match.id,
      venueId: slot.venueId,
      skipped: notify.skipped,
      skipReason: notify.skipReason,
    });
    return { ok: false, reason: 'notify_failed' };
  }

  const updatePayload: Record<string, unknown> = {
    status: APPOINTMENT_WAITLIST_COMPLETED_STATUS,
    offered_at: now.toISOString(),
    expires_at: expiresAt,
    offered_slot_time: timeForDb,
    offered_calendar_id: slot.calendarId,
  };
  if (!match.desired_time) {
    updatePayload.desired_time = timeForDb;
  }

  const { data: updated, error: updateErr } = await admin
    .from('waitlist_entries')
    .update(updatePayload)
    .eq('id', match.id)
    .eq('venue_id', slot.venueId)
    .eq('status', 'waiting')
    .select('id')
    .maybeSingle();

  if (updateErr || !updated) {
    console.error('[offerWaitlistEntryInOrder] offer update failed:', updateErr, {
      waitlistEntryId: match.id,
      venueId: slot.venueId,
    });
    return { ok: false, reason: 'offer_update_failed' };
  }

  return {
    ok: true,
    waitlistEntryId: match.id,
    emailSent: notify.emailSent,
    smsSent: notify.smsSent,
  };
}

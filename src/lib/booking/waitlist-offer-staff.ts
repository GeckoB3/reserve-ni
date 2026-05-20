/**
 * Staff-initiated waitlist offers (staff_choose / manual dashboard offer).
 * No timed expiry — guest can book while the slot remains available.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { notifyAppointmentWaitlistOfferForEntry } from '@/lib/booking/notify-appointment-waitlist-offer';
import type { WaitlistEntryCandidate } from '@/lib/booking/offer-appointment-waitlist-on-cancel';
import { APPOINTMENT_WAITLIST_COMPLETED_STATUS } from '@/lib/booking/waitlist-offer-constants';
import { slotTimeForDb, type WaitlistFreedSlotContext } from '@/lib/booking/waitlist-freed-slot';
import { wasWaitlistOfferNotifySuccessful } from '@/lib/booking/waitlist-offer-notify-success';

export type OfferWaitlistEntryByStaffResult =
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

export async function offerWaitlistEntryByStaff(
  admin: SupabaseClient,
  slot: WaitlistFreedSlotContext,
  match: WaitlistEntryCandidate,
): Promise<OfferWaitlistEntryByStaffResult> {
  const timeForDb = slotTimeForDb(slot.slotTime);
  const now = new Date();

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
    },
    null,
  );

  if (!wasWaitlistOfferNotifySuccessful(notify)) {
    console.warn('[offerWaitlistEntryByStaff] guest was not notified', {
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
    expires_at: null,
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
    console.error('[offerWaitlistEntryByStaff] offer update failed:', updateErr, {
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

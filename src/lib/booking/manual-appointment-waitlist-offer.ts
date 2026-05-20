import type { SupabaseClient } from '@supabase/supabase-js';
import type { WaitlistEntryCandidate } from '@/lib/booking/offer-appointment-waitlist-on-cancel';
import { offerWaitlistEntryByStaff } from '@/lib/booking/waitlist-offer-staff';
import { offerWaitlistEntryInOrder } from '@/lib/booking/waitlist-offer-in-order';
import { findAppointmentWaitlistAvailability } from '@/lib/booking/waitlist-offer-availability';
import {
  findOpenWaitlistOpportunityForEntry,
  opportunityToFreedSlot,
  type WaitlistEntrySlotLookup,
} from '@/lib/booking/waitlist-slot-opportunity-service';
import type { WaitlistFreedSlotContext } from '@/lib/booking/waitlist-freed-slot';
import type { AppointmentWaitlistMode } from '@/lib/booking/waitlist-config';

export async function resolveManualAppointmentOfferSlot(
  admin: SupabaseClient,
  venueId: string,
  entry: WaitlistEntrySlotLookup & {
    desired_time?: string | null;
    desired_time_end?: string | null;
  },
): Promise<WaitlistFreedSlotContext | null> {
  const opportunity = await findOpenWaitlistOpportunityForEntry(admin, venueId, entry);
  if (opportunity) {
    return opportunityToFreedSlot(opportunity);
  }

  const availability = await findAppointmentWaitlistAvailability(admin, venueId, {
    desired_date: entry.desired_date,
    desired_time: entry.desired_time ?? null,
    desired_time_end: entry.desired_time_end ?? null,
    appointment_service_id: entry.appointment_service_id ?? null,
    service_item_id: entry.service_item_id ?? null,
    practitioner_id: entry.practitioner_id ?? null,
  });

  if (!availability.available || !availability.sampleSlotStartHm) {
    return null;
  }

  return {
    venueId,
    slotDate: entry.desired_date,
    slotTime: `${availability.sampleSlotStartHm}:00`,
    calendarId:
      availability.sampleCalendarId ?? entry.practitioner_id ?? null,
    appointmentServiceId: entry.appointment_service_id ?? null,
    serviceItemId: entry.service_item_id ?? null,
  };
}

export async function offerAppointmentWaitlistEntryManually(
  admin: SupabaseClient,
  venueId: string,
  waitlistMode: AppointmentWaitlistMode,
  entry: WaitlistEntryCandidate & WaitlistEntrySlotLookup,
): Promise<
  | {
      ok: true;
      waitlistEntryId: string;
      emailSent: boolean;
      smsSent: boolean;
    }
  | { ok: false; reason: string; status: number }
> {
  const slot = await resolveManualAppointmentOfferSlot(admin, venueId, entry);
  if (!slot) {
    return {
      ok: false,
      reason: 'No appointment availability matches this guest’s requested date and time window.',
      status: 409,
    };
  }

  const offer =
    waitlistMode === 'notify_in_order'
      ? await offerWaitlistEntryInOrder(admin, slot, entry)
      : await offerWaitlistEntryByStaff(admin, slot, entry);

  if (!offer.ok) {
    const status = offer.reason === 'notify_failed' ? 502 : 500;
    return {
      ok: false,
      reason:
        offer.reason === 'notify_failed'
          ? 'Could not notify the guest by email or SMS. The offer was not recorded.'
          : 'Failed to offer appointment to waitlist guest',
      status,
    };
  }

  return offer;
}

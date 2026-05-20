/**
 * Expires timed waitlist offers (notify_in_order) and notifies the next matching guest.
 * Slot stays on the public calendar — no hold.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  parseVenueFeatureFlags,
  resolveAppointmentsFeatureFlag,
} from '@/lib/feature-flags';
import { parseWaitlistConfig } from '@/lib/booking/waitlist-config';
import {
  cancelledBookingFromFreedSlot,
  slotTimeHm,
  type WaitlistFreedSlotContext,
} from '@/lib/booking/waitlist-freed-slot';
import { isWaitlistFreedSlotStillUnbooked } from '@/lib/booking/is-waitlist-freed-slot-unbooked';
import {
  findMatchingWaitlistEntries,
  type WaitlistEntryCandidate,
} from '@/lib/booking/offer-appointment-waitlist-on-cancel';
import { offerWaitlistEntryInOrder } from '@/lib/booking/waitlist-offer-in-order';
import { APPOINTMENT_WAITLIST_COMPLETED_STATUS } from '@/lib/booking/waitlist-offer-constants';
import { markWaitlistOpportunitiesFilledForSlot } from '@/lib/booking/waitlist-slot-opportunity-service';

export interface ProcessExpiredWaitlistOffersResult {
  scanned: number;
  expired: number;
  cascaded: number;
  filled: number;
  errors: number;
}

interface ExpiredOfferRow {
  id: string;
  venue_id: string;
  desired_date: string;
  desired_time: string | null;
  offered_slot_time: string | null;
  offered_calendar_id: string | null;
  appointment_service_id: string | null;
  service_item_id: string | null;
}

function freedSlotFromExpiredOffer(row: ExpiredOfferRow): WaitlistFreedSlotContext | null {
  const slotTime = row.offered_slot_time ?? row.desired_time;
  if (!slotTime) return null;

  return {
    venueId: row.venue_id,
    slotDate: row.desired_date,
    slotTime: String(slotTime),
    calendarId: row.offered_calendar_id,
    appointmentServiceId: row.appointment_service_id,
    serviceItemId: row.service_item_id,
  };
}

async function loadWaitingEntriesForDate(
  admin: SupabaseClient,
  venueId: string,
  date: string,
): Promise<WaitlistEntryCandidate[]> {
  const { data, error } = await admin
    .from('waitlist_entries')
    .select(
      'id, desired_date, desired_time, desired_time_end, practitioner_id, appointment_service_id, service_item_id, guest_first_name, guest_last_name, guest_email, guest_phone, created_at',
    )
    .eq('venue_id', venueId)
    .eq('waitlist_kind', 'appointment')
    .eq('desired_date', date)
    .eq('status', 'waiting')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[processExpiredWaitlistOffers] waiting query failed:', error, { venueId, date });
    return [];
  }

  return (data ?? []) as WaitlistEntryCandidate[];
}

export async function processExpiredWaitlistOffers(
  admin: SupabaseClient,
): Promise<ProcessExpiredWaitlistOffersResult> {
  const result: ProcessExpiredWaitlistOffersResult = {
    scanned: 0,
    expired: 0,
    cascaded: 0,
    filled: 0,
    errors: 0,
  };

  const nowIso = new Date().toISOString();

  const { data: expiredRows, error: fetchErr } = await admin
    .from('waitlist_entries')
    .select(
      'id, venue_id, desired_date, desired_time, offered_slot_time, offered_calendar_id, appointment_service_id, service_item_id',
    )
    .eq('waitlist_kind', 'appointment')
    .in('status', ['offered', APPOINTMENT_WAITLIST_COMPLETED_STATUS])
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso)
    .limit(200);

  if (fetchErr) {
    console.error('[processExpiredWaitlistOffers] fetch failed:', fetchErr);
    result.errors += 1;
    return result;
  }

  const rows = (expiredRows ?? []) as ExpiredOfferRow[];
  result.scanned = rows.length;

  const venueFlagsCache = new Map<string, ReturnType<typeof parseWaitlistConfig>>();

  for (const row of rows) {
    try {
      let waitlistConfig = venueFlagsCache.get(row.venue_id);
      if (!waitlistConfig) {
        const { data: venueRow } = await admin
          .from('venues')
          .select('feature_flags')
          .eq('id', row.venue_id)
          .maybeSingle();
        const flags = parseVenueFeatureFlags(
          (venueRow as { feature_flags?: unknown } | null)?.feature_flags,
        );
        if (!resolveAppointmentsFeatureFlag('waitlist_v2', flags)) {
          venueFlagsCache.set(row.venue_id, { mode: 'notify_in_order' });
          waitlistConfig = { mode: 'notify_in_order' };
        } else {
          waitlistConfig = parseWaitlistConfig(flags);
          venueFlagsCache.set(row.venue_id, waitlistConfig);
        }
      }

      if (waitlistConfig.mode !== 'notify_in_order') {
        const { error: expireOnlyErr } = await admin
          .from('waitlist_entries')
          .update({ status: 'expired' })
          .eq('id', row.id)
          .in('status', ['offered', APPOINTMENT_WAITLIST_COMPLETED_STATUS]);
        if (expireOnlyErr) {
          result.errors += 1;
        } else {
          result.expired += 1;
        }
        continue;
      }

      const slot = freedSlotFromExpiredOffer(row);
      if (!slot) {
        result.errors += 1;
        continue;
      }

      const { error: expireErr } = await admin
        .from('waitlist_entries')
        .update({ status: 'expired' })
        .eq('id', row.id)
        .in('status', ['offered', APPOINTMENT_WAITLIST_COMPLETED_STATUS]);

      if (expireErr) {
        console.error('[processExpiredWaitlistOffers] expire failed:', expireErr, {
          waitlistEntryId: row.id,
        });
        result.errors += 1;
        continue;
      }
      result.expired += 1;

      const stillUnbooked = await isWaitlistFreedSlotStillUnbooked(admin, slot);
      if (!stillUnbooked) {
        await markWaitlistOpportunitiesFilledForSlot(admin, slot);
        result.filled += 1;
        continue;
      }

      const waiting = await loadWaitingEntriesForDate(admin, row.venue_id, row.desired_date);
      const syntheticBooking = cancelledBookingFromFreedSlot(slot);
      const matches = findMatchingWaitlistEntries(waiting, syntheticBooking);
      if (matches.length === 0) {
        continue;
      }

      const cascade = await offerWaitlistEntryInOrder(admin, slot, matches[0]);
      if (cascade.ok) {
        result.cascaded += 1;
      } else {
        result.errors += 1;
      }
    } catch (err) {
      console.error('[processExpiredWaitlistOffers] row failed:', err, { waitlistEntryId: row.id });
      result.errors += 1;
    }
  }

  return result;
}

export function formatWaitlistSlotLabel(slot: WaitlistFreedSlotContext): string {
  return `${slot.slotDate} ${slotTimeHm(slot.slotTime)}`;
}

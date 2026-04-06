import type { SupabaseClient } from '@supabase/supabase-js';
import { BOOKING_ACTIVE_STATUSES } from '@/lib/table-management/constants';

/**
 * Shown when removing a bookable service from a calendar would orphan upcoming appointments
 * that are tied to this calendar + service.
 */
export const SERVICE_REMOVAL_BLOCKED_BY_BOOKINGS =
  'There are upcoming bookings for this service on this calendar. Assign it to another calendar first, or cancel or reschedule those appointments before removing it here.';

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Unified scheduling: future active bookings for these service_items on this calendar column
 * (calendar_id and practitioner_id both hold the unified calendar id in different flows).
 */
export async function hasBlockingBookingsRemovingServicesFromCalendarUnified(
  admin: SupabaseClient,
  params: { venueId: string; calendarId: string; serviceItemIds: string[] },
): Promise<{ blocked: boolean; error?: string }> {
  if (params.serviceItemIds.length === 0) return { blocked: false };
  const today = todayIsoDate();
  const { data, error } = await admin
    .from('bookings')
    .select('id')
    .eq('venue_id', params.venueId)
    .gte('booking_date', today)
    .in('status', [...BOOKING_ACTIVE_STATUSES])
    .in('service_item_id', params.serviceItemIds)
    .or(`calendar_id.eq.${params.calendarId},practitioner_id.eq.${params.calendarId}`)
    .limit(1);

  if (error) {
    console.error('hasBlockingBookingsRemovingServicesFromCalendarUnified:', error.message);
    return { blocked: true, error: 'Could not verify existing bookings.' };
  }
  return { blocked: (data?.length ?? 0) > 0 };
}

/**
 * Legacy practitioner appointment: future active bookings for these appointment_services on this practitioner column.
 */
export async function hasBlockingBookingsRemovingServicesFromCalendarLegacy(
  admin: SupabaseClient,
  params: { venueId: string; practitionerId: string; appointmentServiceIds: string[] },
): Promise<{ blocked: boolean; error?: string }> {
  if (params.appointmentServiceIds.length === 0) return { blocked: false };
  const today = todayIsoDate();
  const { data, error } = await admin
    .from('bookings')
    .select('id')
    .eq('venue_id', params.venueId)
    .eq('practitioner_id', params.practitionerId)
    .gte('booking_date', today)
    .in('status', [...BOOKING_ACTIVE_STATUSES])
    .in('appointment_service_id', params.appointmentServiceIds)
    .limit(1);

  if (error) {
    console.error('hasBlockingBookingsRemovingServicesFromCalendarLegacy:', error.message);
    return { blocked: true, error: 'Could not verify existing bookings.' };
  }
  return { blocked: (data?.length ?? 0) > 0 };
}

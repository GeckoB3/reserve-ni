/**
 * Resolves deposit-refund cancellation notice hours for a booking from per-entity columns.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingModel } from '@/types/booking-models';
import { entityBookingWindowFromRow, DEFAULT_ENTITY_BOOKING_WINDOW } from '@/lib/booking/entity-booking-window';

export async function resolveCancellationNoticeHoursForCreate(params: {
  supabase: SupabaseClient;
  venueId: string;
  effectiveModel: BookingModel;
  /** Table reservation: venue_services.id */
  tableServiceId?: string | null;
  /** Unified / legacy appointment: service_items.id or appointment_services.id */
  appointmentServiceId?: string | null;
  /** Unified scheduling uses service_items for practitioner appointments */
  serviceItemId?: string | null;
  experienceEventId?: string | null;
  classInstanceId?: string | null;
  resourceCalendarId?: string | null;
  /** Unified event/session: optional service_item on session */
  eventSessionServiceItemId?: string | null;
}): Promise<number> {
  const {
    supabase,
    venueId,
    effectiveModel,
    tableServiceId,
    appointmentServiceId,
    serviceItemId,
    experienceEventId,
    classInstanceId,
    resourceCalendarId,
    eventSessionServiceItemId,
  } = params;

  const fallback = DEFAULT_ENTITY_BOOKING_WINDOW.cancellation_notice_hours;

  try {
    if (effectiveModel === 'table_reservation' && tableServiceId) {
      const { data: br } = await supabase
        .from('booking_restrictions')
        .select('cancellation_notice_hours')
        .eq('service_id', tableServiceId)
        .maybeSingle();
      const h = (br as { cancellation_notice_hours?: number } | null)?.cancellation_notice_hours;
      if (typeof h === 'number' && Number.isFinite(h)) return h;
      return fallback;
    }

    if (experienceEventId) {
      const { data: ev } = await supabase
        .from('experience_events')
        .select('cancellation_notice_hours')
        .eq('id', experienceEventId)
        .eq('venue_id', venueId)
        .maybeSingle();
      const h = (ev as { cancellation_notice_hours?: number } | null)?.cancellation_notice_hours;
      if (typeof h === 'number' && Number.isFinite(h)) return h;
      return fallback;
    }

    if (classInstanceId) {
      const { data: inst } = await supabase
        .from('class_instances')
        .select('class_type_id')
        .eq('id', classInstanceId)
        .maybeSingle();
      const ctId = (inst as { class_type_id?: string } | null)?.class_type_id;
      if (ctId) {
        const { data: ct } = await supabase
          .from('class_types')
          .select('cancellation_notice_hours')
          .eq('id', ctId)
          .eq('venue_id', venueId)
          .maybeSingle();
        const h = (ct as { cancellation_notice_hours?: number } | null)?.cancellation_notice_hours;
        if (typeof h === 'number' && Number.isFinite(h)) return h;
      }
      return fallback;
    }

    if (resourceCalendarId) {
      const { data: cal } = await supabase
        .from('unified_calendars')
        .select('cancellation_notice_hours, calendar_type')
        .eq('id', resourceCalendarId)
        .eq('venue_id', venueId)
        .maybeSingle();
      const h = (cal as { cancellation_notice_hours?: number } | null)?.cancellation_notice_hours;
      if (typeof h === 'number' && Number.isFinite(h)) return h;
      return fallback;
    }

    const svcId = serviceItemId ?? appointmentServiceId ?? eventSessionServiceItemId;
    if (svcId) {
      const { data: si } = await supabase
        .from('service_items')
        .select('cancellation_notice_hours')
        .eq('id', svcId)
        .eq('venue_id', venueId)
        .maybeSingle();
      if (si) {
        return entityBookingWindowFromRow(si as Record<string, unknown>).cancellation_notice_hours;
      }
      const { data: leg } = await supabase
        .from('appointment_services')
        .select('cancellation_notice_hours')
        .eq('id', svcId)
        .eq('venue_id', venueId)
        .maybeSingle();
      if (leg) {
        return entityBookingWindowFromRow(leg as Record<string, unknown>).cancellation_notice_hours;
      }
    }

    if (!svcId && (effectiveModel === 'practitioner_appointment' || effectiveModel === 'unified_scheduling')) {
      if (appointmentServiceId) {
        const { data: leg } = await supabase
          .from('appointment_services')
          .select('cancellation_notice_hours')
          .eq('id', appointmentServiceId)
          .eq('venue_id', venueId)
          .maybeSingle();
        if (leg) {
          return entityBookingWindowFromRow(leg as Record<string, unknown>).cancellation_notice_hours;
        }
      }
    }
  } catch (e) {
    console.error('[resolveCancellationNoticeHoursForCreate] failed', e);
  }

  return fallback;
}

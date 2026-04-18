import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingModel } from '@/types/booking-models';

/**
 * Copies resolved entity ids from one `import_booking_references` row onto matching `import_booking_rows`.
 */
export async function denormalizeReferenceOntoBookingRows(
  admin: SupabaseClient,
  sessionId: string,
  venueId: string,
  ref: {
    reference_type: string;
    raw_value: string;
    resolution_action: string | null;
    resolved_entity_id: string | null;
    resolved_entity_type: string | null;
  },
  bookingModel: BookingModel,
): Promise<void> {
  const raw = ref.raw_value.trim();
  if (!raw) return;

  const type = ref.reference_type;

  if (ref.resolution_action === 'skip') {
    if (type === 'service') {
      await admin
        .from('import_booking_rows')
        .update({ resolved_service_id: null, resolved_appointment_service_id: null })
        .eq('session_id', sessionId)
        .eq('venue_id', venueId)
        .eq('raw_service_name', raw);
    } else if (type === 'staff') {
      if (bookingModel === 'practitioner_appointment') {
        await admin
          .from('import_booking_rows')
          .update({ resolved_practitioner_id: null, resolved_calendar_id: null })
          .eq('session_id', sessionId)
          .eq('venue_id', venueId)
          .eq('raw_staff_name', raw);
      } else if (bookingModel === 'unified_scheduling') {
        await admin
          .from('import_booking_rows')
          .update({ resolved_calendar_id: null })
          .eq('session_id', sessionId)
          .eq('venue_id', venueId)
          .eq('raw_staff_name', raw);
      }
    } else if (type === 'event') {
      await admin
        .from('import_booking_rows')
        .update({ resolved_event_session_id: null })
        .eq('session_id', sessionId)
        .eq('venue_id', venueId)
        .eq('raw_event_name', raw);
    } else if (type === 'class') {
      await admin
        .from('import_booking_rows')
        .update({ resolved_class_instance_id: null })
        .eq('session_id', sessionId)
        .eq('venue_id', venueId)
        .eq('raw_class_name', raw);
    } else if (type === 'resource') {
      await admin
        .from('import_booking_rows')
        .update({ resolved_resource_id: null })
        .eq('session_id', sessionId)
        .eq('venue_id', venueId)
        .eq('raw_resource_name', raw);
    }
    return;
  }

  if (ref.resolution_action !== 'map' && ref.resolution_action !== 'create') return;
  const eid = ref.resolved_entity_id;
  const et = ref.resolved_entity_type;
  if (!eid || !et) return;

  if (type === 'service' && et === 'service_item') {
    await admin
      .from('import_booking_rows')
      .update({ resolved_service_id: eid, resolved_appointment_service_id: null })
      .eq('session_id', sessionId)
      .eq('venue_id', venueId)
      .eq('raw_service_name', raw);
  } else if (type === 'service' && et === 'appointment_service') {
    await admin
      .from('import_booking_rows')
      .update({ resolved_appointment_service_id: eid, resolved_service_id: null })
      .eq('session_id', sessionId)
      .eq('venue_id', venueId)
      .eq('raw_service_name', raw);
  } else if (type === 'staff' && et === 'unified_calendar') {
    await admin
      .from('import_booking_rows')
      .update({ resolved_calendar_id: eid })
      .eq('session_id', sessionId)
      .eq('venue_id', venueId)
      .eq('raw_staff_name', raw);
  } else if (type === 'staff' && et === 'practitioner') {
    await admin
      .from('import_booking_rows')
      .update({ resolved_practitioner_id: eid, resolved_calendar_id: null })
      .eq('session_id', sessionId)
      .eq('venue_id', venueId)
      .eq('raw_staff_name', raw);
  } else if (type === 'event' && et === 'event_session') {
    await admin
      .from('import_booking_rows')
      .update({ resolved_event_session_id: eid })
      .eq('session_id', sessionId)
      .eq('venue_id', venueId)
      .eq('raw_event_name', raw);
  } else if (type === 'class' && et === 'class_instance') {
    await admin
      .from('import_booking_rows')
      .update({ resolved_class_instance_id: eid })
      .eq('session_id', sessionId)
      .eq('venue_id', venueId)
      .eq('raw_class_name', raw);
  } else if (type === 'resource' && et === 'unified_calendar') {
    await admin
      .from('import_booking_rows')
      .update({ resolved_resource_id: eid })
      .eq('session_id', sessionId)
      .eq('venue_id', venueId)
      .eq('raw_resource_name', raw);
  }
}

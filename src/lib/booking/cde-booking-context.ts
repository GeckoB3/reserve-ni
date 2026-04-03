/**
 * Staff booking detail: human-readable labels for C/D/E rows (Sprint 1.4).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingModel } from '@/types/booking-models';

export interface CdeBookingContext {
  inferred_model: BookingModel;
  title: string;
  subtitle?: string | null;
}

type BookingLike = {
  experience_event_id?: string | null;
  class_instance_id?: string | null;
  resource_id?: string | null;
  booking_end_time?: string | null;
};

export async function resolveCdeBookingContext(
  supabase: Pick<SupabaseClient, 'from'>,
  booking: BookingLike,
): Promise<CdeBookingContext | null> {
  const ex = booking.experience_event_id;
  if (ex) {
    const { data: ev } = await supabase
      .from('experience_events')
      .select('name, end_time')
      .eq('id', ex)
      .maybeSingle();
    const end = ev?.end_time != null ? String(ev.end_time).slice(0, 5) : null;
    return {
      inferred_model: 'event_ticket',
      title: (ev as { name?: string } | null)?.name ?? 'Event',
      subtitle: end ? `Ends ${end}` : null,
    };
  }

  const ci = booking.class_instance_id;
  if (ci) {
    const { data: inst } = await supabase
      .from('class_instances')
      .select('start_time, class_type_id')
      .eq('id', ci)
      .maybeSingle();
    const ctId = (inst as { class_type_id?: string } | null)?.class_type_id;
    let title = 'Class';
    if (ctId) {
      const { data: ct } = await supabase.from('class_types').select('name').eq('id', ctId).maybeSingle();
      title = (ct as { name?: string } | null)?.name ?? title;
    }
    const st = (inst as { start_time?: string } | null)?.start_time;
    const startStr = st != null ? String(st).slice(0, 5) : null;
    return {
      inferred_model: 'class_session',
      title,
      subtitle: startStr ? `Starts ${startStr}` : null,
    };
  }

  const rid = booking.resource_id;
  if (rid) {
    const { data: res } = await supabase.from('venue_resources').select('name').eq('id', rid).maybeSingle();
    const end = booking.booking_end_time != null ? String(booking.booking_end_time).slice(0, 5) : null;
    return {
      inferred_model: 'resource_booking',
      title: (res as { name?: string } | null)?.name ?? 'Resource',
      subtitle: end ? `Until ${end}` : null,
    };
  }

  return null;
}

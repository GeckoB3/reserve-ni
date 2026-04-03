/**
 * Load practitioner / calendar + service names for appointment booking emails (cron + payment webhooks).
 * Supports legacy Model B (`practitioner_id` + `appointment_service_id`) and USE (`calendar_id` + `service_item_id`).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingEmailData, GroupAppointmentLine } from '@/lib/emails/types';
import { formatDepositAmount } from '@/lib/emails/templates/base-template';

function priceDisplayFromPence(pricePence: number | null | undefined): string | null {
  if (pricePence == null) return null;
  return `£${formatDepositAmount(pricePence)}`;
}

type BookingAnchorRow = {
  practitioner_id: string | null;
  appointment_service_id: string | null;
  calendar_id: string | null;
  service_item_id: string | null;
  group_booking_id: string | null;
  guest_id: string | null;
  person_label: string | null;
};

async function resolveAppointmentLabels(
  supabase: SupabaseClient,
  row: BookingAnchorRow,
): Promise<{
  practitionerName: string | null;
  serviceName: string | null;
  appointmentPriceDisplay: string | null;
} | null> {
  const legacyPr = row.practitioner_id;
  const legacySvc = row.appointment_service_id;
  const cal = row.calendar_id;
  const item = row.service_item_id;

  if (legacyPr && legacySvc) {
    const [{ data: pr }, { data: svc }] = await Promise.all([
      supabase.from('practitioners').select('name').eq('id', legacyPr).maybeSingle(),
      supabase.from('appointment_services').select('name, price_pence').eq('id', legacySvc).maybeSingle(),
    ]);
    return {
      practitionerName: pr?.name ?? null,
      serviceName: svc?.name ?? null,
      appointmentPriceDisplay: priceDisplayFromPence(svc?.price_pence ?? null),
    };
  }

  if (cal && item) {
    const [{ data: uc }, { data: si }] = await Promise.all([
      supabase.from('unified_calendars').select('name').eq('id', cal).maybeSingle(),
      supabase.from('service_items').select('name, price_pence').eq('id', item).maybeSingle(),
    ]);
    return {
      practitionerName: uc?.name ?? null,
      serviceName: si?.name ?? null,
      appointmentPriceDisplay: priceDisplayFromPence(si?.price_pence ?? null),
    };
  }

  if (cal) {
    const { data: uc } = await supabase.from('unified_calendars').select('name').eq('id', cal).maybeSingle();
    return {
      practitionerName: uc?.name ?? null,
      serviceName: null,
      appointmentPriceDisplay: null,
    };
  }

  return null;
}

/**
 * Fills `email_variant` and appointment fields when the booking row has either
 * legacy (`practitioner_id` + `appointment_service_id`) or USE (`calendar_id` + `service_item_id`) anchors.
 */
export async function enrichBookingEmailForAppointment(
  supabase: SupabaseClient,
  bookingId: string,
  base: BookingEmailData,
): Promise<BookingEmailData> {
  const { data: row, error } = await supabase
    .from('bookings')
    .select(
      'practitioner_id, appointment_service_id, calendar_id, service_item_id, group_booking_id, guest_id, person_label',
    )
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !row) {
    return base;
  }

  const anchor = row as BookingAnchorRow;
  const resolved = await resolveAppointmentLabels(supabase, anchor);
  if (!resolved) {
    return base;
  }

  const { practitionerName, serviceName, appointmentPriceDisplay } = resolved;

  let groupAppointments: GroupAppointmentLine[] | undefined;

  if (anchor.group_booking_id && anchor.guest_id) {
    const { data: siblings } = await supabase
      .from('bookings')
      .select(
        'id, booking_date, booking_time, practitioner_id, appointment_service_id, calendar_id, service_item_id, person_label',
      )
      .eq('group_booking_id', anchor.group_booking_id)
      .eq('guest_id', anchor.guest_id)
      .order('booking_date')
      .order('booking_time');

    if (siblings && siblings.length > 1) {
      const prIds = [...new Set(siblings.map((s) => s.practitioner_id).filter(Boolean))] as string[];
      const svcIds = [...new Set(siblings.map((s) => s.appointment_service_id).filter(Boolean))] as string[];
      const calIds = [...new Set(siblings.map((s) => s.calendar_id).filter(Boolean))] as string[];
      const itemIds = [...new Set(siblings.map((s) => s.service_item_id).filter(Boolean))] as string[];

      const [{ data: pracs }, { data: svcs }, { data: cals }, { data: items }] = await Promise.all([
        prIds.length ? supabase.from('practitioners').select('id, name').in('id', prIds) : { data: [] },
        svcIds.length ? supabase.from('appointment_services').select('id, name, price_pence').in('id', svcIds) : { data: [] },
        calIds.length ? supabase.from('unified_calendars').select('id, name').in('id', calIds) : { data: [] },
        itemIds.length ? supabase.from('service_items').select('id, name, price_pence').in('id', itemIds) : { data: [] },
      ]);

      const prMap = new Map((pracs ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
      const calMap = new Map((cals ?? []).map((c: { id: string; name: string }) => [c.id, c.name]));
      const svMap = new Map(
        (svcs ?? []).map((s: { id: string; name: string; price_pence: number | null }) => [
          s.id,
          { name: s.name, price_pence: s.price_pence },
        ]),
      );
      const itemMap = new Map(
        (items ?? []).map((s: { id: string; name: string; price_pence: number | null }) => [
          s.id,
          { name: s.name, price_pence: s.price_pence },
        ]),
      );

      groupAppointments = siblings.map((s) => {
        const label = (s.person_label as string | null)?.trim() || 'Guest';
        const timeStr = typeof s.booking_time === 'string' ? s.booking_time.slice(0, 5) : '00:00';
        const pid = s.practitioner_id as string | null;
        const sid = s.appointment_service_id as string | null;
        const cid = s.calendar_id as string | null;
        const iid = s.service_item_id as string | null;

        let practitionerNameLine = 'Staff';
        let serviceNameLine = 'Treatment';
        let priceDisplay: string | null = null;

        if (pid && sid) {
          practitionerNameLine = prMap.get(pid) ?? 'Staff';
          const sv = svMap.get(sid);
          serviceNameLine = sv?.name ?? 'Treatment';
          priceDisplay = priceDisplayFromPence(sv?.price_pence ?? null);
        } else if (cid && iid) {
          practitionerNameLine = calMap.get(cid) ?? 'Staff';
          const it = itemMap.get(iid);
          serviceNameLine = it?.name ?? 'Treatment';
          priceDisplay = priceDisplayFromPence(it?.price_pence ?? null);
        }

        return {
          person_label: label,
          booking_date: s.booking_date as string,
          booking_time: timeStr,
          practitioner_name: practitionerNameLine,
          service_name: serviceNameLine,
          price_display: priceDisplay,
        };
      });
    }
  }

  return {
    ...base,
    email_variant: 'appointment',
    practitioner_name: practitionerName,
    appointment_service_name: serviceName,
    appointment_price_display: appointmentPriceDisplay,
    ...(groupAppointments && groupAppointments.length > 0 ? { group_appointments: groupAppointments } : {}),
  };
}

/**
 * Models C/D/E: event, class, resource — labels for confirmation/reminder templates from FK ids.
 * Run after `enrichBookingEmailForAppointment` so USE/Model B wins when both anchors exist.
 */
export async function enrichBookingEmailForSecondaryModels(
  supabase: SupabaseClient,
  bookingId: string,
  base: BookingEmailData,
): Promise<BookingEmailData> {
  const { data: row, error } = await supabase
    .from('bookings')
    .select('experience_event_id, class_instance_id, resource_id, booking_end_time')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !row) return base;

  const r = row as {
    experience_event_id: string | null;
    class_instance_id: string | null;
    resource_id: string | null;
    booking_end_time: string | null;
  };

  if (r.experience_event_id) {
    const { data: ev } = await supabase
      .from('experience_events')
      .select('name')
      .eq('id', r.experience_event_id)
      .maybeSingle();
    return {
      ...base,
      email_variant: 'appointment',
      booking_model: 'event_ticket',
      appointment_service_name: ev?.name ?? base.appointment_service_name ?? null,
    };
  }

  if (r.class_instance_id) {
    const { data: inst } = await supabase
      .from('class_instances')
      .select('class_type_id')
      .eq('id', r.class_instance_id)
      .maybeSingle();
    const ctId = inst?.class_type_id;
    if (ctId) {
      const { data: ct } = await supabase.from('class_types').select('name').eq('id', ctId).maybeSingle();
      return {
        ...base,
        email_variant: 'appointment',
        booking_model: 'class_session',
        appointment_service_name: ct?.name ?? base.appointment_service_name ?? null,
      };
    }
  }

  if (r.resource_id) {
    const { data: res } = await supabase
      .from('venue_resources')
      .select('name')
      .eq('id', r.resource_id)
      .maybeSingle();
    const end = r.booking_end_time ? String(r.booking_end_time).slice(0, 5) : null;
    return {
      ...base,
      email_variant: 'appointment',
      booking_model: 'resource_booking',
      appointment_service_name: res?.name ?? base.appointment_service_name ?? null,
      practitioner_name: end ? `Until ${end}` : base.practitioner_name ?? null,
    };
  }

  return base;
}

/** Appointment/USE enrichment then C/D/E labels for transactional and scheduled comms. */
export async function enrichBookingEmailForComms(
  supabase: SupabaseClient,
  bookingId: string,
  base: BookingEmailData,
): Promise<BookingEmailData> {
  const appt = await enrichBookingEmailForAppointment(supabase, bookingId, base);
  return enrichBookingEmailForSecondaryModels(supabase, bookingId, appt);
}

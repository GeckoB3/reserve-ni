/**
 * Load practitioner / service / group lines for Model B booking emails (cron + payment webhooks).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { BookingEmailData, GroupAppointmentLine } from '@/lib/emails/types';
import { formatDepositAmount } from '@/lib/emails/templates/base-template';

function priceDisplayFromPence(pricePence: number | null | undefined): string | null {
  if (pricePence == null) return null;
  return `£${formatDepositAmount(pricePence)}`;
}

/**
 * Fills `email_variant` and appointment fields on booking email payloads when
 * `practitioner_id` / `appointment_service_id` are set on the booking row.
 */
export async function enrichBookingEmailForAppointment(
  supabase: SupabaseClient,
  bookingId: string,
  base: BookingEmailData,
): Promise<BookingEmailData> {
  const { data: row, error } = await supabase
    .from('bookings')
    .select('practitioner_id, appointment_service_id, group_booking_id, guest_id, person_label')
    .eq('id', bookingId)
    .maybeSingle();

  if (error || !row?.practitioner_id || !row?.appointment_service_id) {
    return base;
  }

  const [{ data: pr }, { data: svc }] = await Promise.all([
    supabase.from('practitioners').select('name').eq('id', row.practitioner_id).maybeSingle(),
    supabase.from('appointment_services').select('name, price_pence').eq('id', row.appointment_service_id).maybeSingle(),
  ]);

  const practitionerName = pr?.name ?? null;
  const serviceName = svc?.name ?? null;
  const appointmentPriceDisplay = priceDisplayFromPence(svc?.price_pence ?? null);

  let groupAppointments: GroupAppointmentLine[] | undefined;

  if (row.group_booking_id && row.guest_id) {
    const { data: siblings } = await supabase
      .from('bookings')
      .select('id, booking_date, booking_time, practitioner_id, appointment_service_id, person_label')
      .eq('group_booking_id', row.group_booking_id)
      .eq('guest_id', row.guest_id)
      .order('booking_date')
      .order('booking_time');

    if (siblings && siblings.length > 1) {
      const prIds = [...new Set(siblings.map((s) => s.practitioner_id).filter(Boolean))] as string[];
      const svcIds = [...new Set(siblings.map((s) => s.appointment_service_id).filter(Boolean))] as string[];
      const [{ data: pracs }, { data: svcs }] = await Promise.all([
        prIds.length ? supabase.from('practitioners').select('id, name').in('id', prIds) : { data: [] },
        svcIds.length ? supabase.from('appointment_services').select('id, name, price_pence').in('id', svcIds) : { data: [] },
      ]);
      const prMap = new Map((pracs ?? []).map((p: { id: string; name: string }) => [p.id, p.name]));
      const svMap = new Map(
        (svcs ?? []).map((s: { id: string; name: string; price_pence: number | null }) => [
          s.id,
          { name: s.name, price_pence: s.price_pence },
        ]),
      );

      groupAppointments = siblings.map((s) => {
        const label = (s.person_label as string | null)?.trim() || 'Guest';
        const timeStr = typeof s.booking_time === 'string' ? s.booking_time.slice(0, 5) : '00:00';
        const pid = s.practitioner_id as string;
        const sid = s.appointment_service_id as string;
        const sv = svMap.get(sid);
        return {
          person_label: label,
          booking_date: s.booking_date as string,
          booking_time: timeStr,
          practitioner_name: prMap.get(pid) ?? 'Staff',
          service_name: sv?.name ?? 'Treatment',
          price_display: priceDisplayFromPence(sv?.price_pence ?? null),
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

/**
 * Date-independent service + staff catalog for Model B guest booking (service/stylist pickers).
 * `unified_scheduling` uses unified_calendars + service_items + calendar_service_assignments.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppointmentService, ClassPaymentRequirement, Practitioner, PractitionerService } from '@/types/booking-models';
import { getOfferedAppointmentServicesForPractitioner } from '@/lib/availability/appointment-engine';
import { unifiedCalendarRowToPractitioner } from '@/lib/availability/unified-calendar-mapper';

export interface AppointmentCatalogPractitioner {
  id: string;
  name: string;
  services: Array<{
    id: string;
    name: string;
    duration_minutes: number;
    buffer_minutes: number;
    price_pence: number | null;
    deposit_pence: number | null;
    payment_requirement?: ClassPaymentRequirement;
  }>;
}

function serviceItemRowToAppointmentService(row: Record<string, unknown>): AppointmentService {
  return {
    id: row.id as string,
    venue_id: row.venue_id as string,
    name: row.name as string,
    description: (row.description as string | null) ?? null,
    duration_minutes: row.duration_minutes as number,
    buffer_minutes: (row.buffer_minutes as number) ?? 0,
    processing_time_minutes: (row.processing_time_minutes as number) ?? 0,
    price_pence: (row.price_pence as number | null) ?? null,
    payment_requirement: (row.payment_requirement as ClassPaymentRequirement | undefined) ?? undefined,
    deposit_pence: (row.deposit_pence as number | null) ?? null,
    colour: (row.colour as string) ?? '#3B82F6',
    is_active: row.is_active !== false,
    sort_order: (row.sort_order as number) ?? 0,
    created_at: (row.created_at as string) ?? new Date().toISOString(),
  };
}

async function fetchUnifiedAppointmentCatalog(
  supabase: SupabaseClient,
  venueId: string,
  options?: { practitionerSlug?: string },
): Promise<{ practitioners: AppointmentCatalogPractitioner[] }> {
  const calQuery = supabase
    .from('unified_calendars')
    .select('*')
    .eq('venue_id', venueId)
    .eq('is_active', true)
    .order('sort_order');

  const { data: calendarRows, error: calErr } = await calQuery;
  if (calErr) {
    console.warn('[fetchUnifiedAppointmentCatalog] unified_calendars:', calErr.message);
  }
  let calendars = (calendarRows ?? []) as Record<string, unknown>[];
  if (options?.practitionerSlug) {
    const slug = options.practitionerSlug.trim().toLowerCase();
    calendars = calendars.filter((c) => ((c.slug as string) ?? '').toLowerCase() === slug);
  }

  if (calendars.length === 0) {
    return { practitioners: [] };
  }

  const calendarIds = calendars.map((c) => c.id as string);

  const [servicesRes, assignRes] = await Promise.all([
    supabase
      .from('service_items')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('calendar_service_assignments')
      .select('id, calendar_id, service_item_id, custom_duration_minutes, custom_price_pence')
      .in('calendar_id', calendarIds),
  ]);

  const services = ((servicesRes.data ?? []) as Record<string, unknown>[]).map(serviceItemRowToAppointmentService);
  const practitionerServices: PractitionerService[] = (assignRes.data ?? []).map((a) => {
    const row = a as {
      id: string;
      calendar_id: string;
      service_item_id: string;
      custom_duration_minutes: number | null;
      custom_price_pence: number | null;
    };
    return {
      id: row.id,
      practitioner_id: row.calendar_id,
      service_id: row.service_item_id,
      custom_duration_minutes: row.custom_duration_minutes,
      custom_price_pence: row.custom_price_pence,
    };
  });

  const practitioners: Practitioner[] = calendars.map((row) => unifiedCalendarRowToPractitioner(row));
  const result: AppointmentCatalogPractitioner[] = [];

  for (const practitioner of practitioners) {
    if (!practitioner.is_active) continue;
    const offeredServices = getOfferedAppointmentServicesForPractitioner(practitioner, services, practitionerServices);
    if (offeredServices.length === 0) continue;

    result.push({
      id: practitioner.id,
      name: practitioner.name,
      services: offeredServices.map((svc) => ({
        id: svc.id,
        name: svc.name,
        duration_minutes: svc.duration_minutes,
        buffer_minutes: svc.buffer_minutes ?? 0,
        price_pence: svc.price_pence,
        deposit_pence: svc.deposit_pence,
        payment_requirement: svc.payment_requirement,
      })),
    });
  }

  return { practitioners: result };
}

export async function fetchAppointmentCatalog(
  supabase: SupabaseClient,
  venueId: string,
  options?: { practitionerSlug?: string },
): Promise<{ practitioners: AppointmentCatalogPractitioner[] }> {
  const { data: venueRow } = await supabase
    .from('venues')
    .select('booking_model')
    .eq('id', venueId)
    .maybeSingle();
  const bookingModel = (venueRow as { booking_model?: string } | null)?.booking_model;
  if (bookingModel === 'unified_scheduling') {
    return fetchUnifiedAppointmentCatalog(supabase, venueId, options);
  }

  const [practitionersRes, allServicesRes, psRes] = await Promise.all([
    supabase
      .from('practitioners')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase
      .from('appointment_services')
      .select('*')
      .eq('venue_id', venueId)
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('practitioner_services').select('*, practitioners!inner(venue_id)').eq('practitioners.venue_id', venueId),
  ]);

  let practitioners = (practitionersRes.data ?? []) as Practitioner[];
  const services = (allServicesRes.data ?? []) as AppointmentService[];
  const practitionerServices = (psRes.data ?? []) as PractitionerService[];

  if (options?.practitionerSlug) {
    const slug = options.practitionerSlug.trim().toLowerCase();
    practitioners = practitioners.filter(
      (p) => p.is_active && (p.slug ?? '').toLowerCase() === slug,
    );
  }

  const result: AppointmentCatalogPractitioner[] = [];

  for (const practitioner of practitioners) {
    if (!practitioner.is_active) continue;
    const offeredServices = getOfferedAppointmentServicesForPractitioner(practitioner, services, practitionerServices);
    if (offeredServices.length === 0) continue;

    result.push({
      id: practitioner.id,
      name: practitioner.name,
      services: offeredServices.map((svc) => ({
        id: svc.id,
        name: svc.name,
        duration_minutes: svc.duration_minutes,
        buffer_minutes: svc.buffer_minutes ?? 0,
        price_pence: svc.price_pence,
        deposit_pence: svc.deposit_pence,
        payment_requirement: svc.payment_requirement,
      })),
    });
  }

  return { practitioners: result };
}

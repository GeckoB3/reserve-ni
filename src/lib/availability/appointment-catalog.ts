/**
 * Date-independent service + staff catalog for Model B guest booking (service/stylist pickers).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppointmentService, Practitioner, PractitionerService } from '@/types/booking-models';
import { getOfferedAppointmentServicesForPractitioner } from '@/lib/availability/appointment-engine';

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
  }>;
}

export async function fetchAppointmentCatalog(
  supabase: SupabaseClient,
  venueId: string,
  options?: { practitionerSlug?: string },
): Promise<{ practitioners: AppointmentCatalogPractitioner[] }> {
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
      })),
    });
  }

  return { practitioners: result };
}

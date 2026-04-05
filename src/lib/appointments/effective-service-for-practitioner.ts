import type { AppointmentService, PractitionerService } from '@/types/booking-models';
import { mergeAppointmentServiceWithPractitionerLink } from './merge-service-with-overrides';

/**
 * Resolves the practitioner_services / calendar_service_assignments row for a given offering, if any.
 * When the calendar has no service links at all, returns null (no appointment services on that column).
 */
export function resolvePractitionerServiceLink(
  allLinks: PractitionerService[],
  practitionerId: string,
  serviceId: string,
): PractitionerService | null {
  const pracLinks = allLinks.filter((l) => l.practitioner_id === practitionerId);
  if (pracLinks.length === 0) return null;
  return pracLinks.find((l) => l.service_id === serviceId) ?? null;
}

/** Merged effective service for a practitioner (venue defaults + optional overrides). */
export function effectiveAppointmentServiceForPractitioner(
  base: AppointmentService,
  practitionerId: string,
  allLinks: PractitionerService[],
): AppointmentService {
  const pracLinks = allLinks.filter((l) => l.practitioner_id === practitionerId);
  const link =
    pracLinks.length === 0
      ? null
      : pracLinks.find((l) => l.service_id === base.id) ?? null;
  return mergeAppointmentServiceWithPractitionerLink(base, link);
}

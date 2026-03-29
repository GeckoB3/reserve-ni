import type { AppointmentService, PractitionerService } from '@/types/booking-models';
import { mergeAppointmentServiceWithPractitionerLink } from './merge-service-with-overrides';

/**
 * Resolves the practitioner_services row for a given offering, if any.
 * When the practitioner has no explicit links, all venue services apply and there is no row.
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

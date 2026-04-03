/**
 * Canonical public booking tab slugs (?tab=) - Docs/ReserveNI_Unified_Booking_Functionality.md Appendix A.
 * Used by /book/[slug], embed iframe, and support links; keep in sync everywhere.
 */

import type { BookingModel } from '@/types/booking-models';
import { BOOKING_MODEL_ORDER } from '@/lib/booking/enabled-models';
import type { VenueTerminology } from '@/types/booking-models';
import { DEFAULT_TERMINOLOGY } from '@/types/booking-models';

export const PUBLIC_BOOK_TAB_SLUGS = [
  'tables',
  'appointments',
  'events',
  'classes',
  'resources',
] as const;

export type PublicBookTabSlug = (typeof PUBLIC_BOOK_TAB_SLUGS)[number];

const SLUG_SET = new Set<string>(PUBLIC_BOOK_TAB_SLUGS);

export function isPublicBookTabSlug(s: string | null | undefined): s is PublicBookTabSlug {
  return s != null && s !== '' && SLUG_SET.has(s);
}

/** Maps booking model to URL tab slug (one canonical slug per model). */
export const BOOKING_MODEL_TO_PUBLIC_TAB: Record<BookingModel, PublicBookTabSlug> = {
  table_reservation: 'tables',
  practitioner_appointment: 'appointments',
  unified_scheduling: 'appointments',
  event_ticket: 'events',
  class_session: 'classes',
  resource_booking: 'resources',
};

export interface PublicBookTabDef {
  slug: PublicBookTabSlug;
  /** Short label for tab UI */
  label: string;
  bookingModel: BookingModel;
}

function labelForModel(m: BookingModel, terminology: VenueTerminology | undefined): string {
  const t = terminology ?? DEFAULT_TERMINOLOGY[m];
  switch (m) {
    case 'table_reservation':
      return t.booking === 'Reservation' ? 'Tables' : t.booking;
    case 'practitioner_appointment':
    case 'unified_scheduling':
      return t.booking === 'Appointment' ? 'Appointments' : t.booking;
    case 'event_ticket':
      return 'Events';
    case 'class_session':
      return 'Classes';
    case 'resource_booking':
      return 'Resources';
    default:
      return m;
  }
}

/**
 * Ordered tab definitions for a venue (primary + enabled_models). Stable order: enum order.
 */
export function publicBookTabsForVenue(
  primary: BookingModel,
  enabledModels: BookingModel[],
  terminology?: Partial<VenueTerminology> | null
): PublicBookTabDef[] {
  const mergedTerms: VenueTerminology = {
    ...DEFAULT_TERMINOLOGY[primary],
    ...(terminology && typeof terminology === 'object' ? terminology : {}),
  };
  const models = new Set<BookingModel>([primary, ...enabledModels]);
  const ordered = BOOKING_MODEL_ORDER.filter((m) => models.has(m));
  const out: PublicBookTabDef[] = [];
  for (const m of ordered) {
    out.push({
      slug: BOOKING_MODEL_TO_PUBLIC_TAB[m],
      label: labelForModel(m, mergedTerms),
      bookingModel: m,
    });
  }
  return out;
}

/** Default tab slug for a venue (always the primary model’s slug). */
export function primaryPublicBookTabSlug(primary: BookingModel): PublicBookTabSlug {
  return BOOKING_MODEL_TO_PUBLIC_TAB[primary] ?? 'tables';
}

/**
 * Validates `?tab=` against exposed models; falls back to primary slug.
 */
export function resolvePublicBookTabFromQuery(
  tabParam: string | null | undefined,
  primary: BookingModel,
  enabledModels: BookingModel[],
  terminology?: Partial<VenueTerminology> | null
): PublicBookTabSlug {
  const tabs = publicBookTabsForVenue(primary, enabledModels, terminology);
  if (tabs.length <= 1) {
    return primaryPublicBookTabSlug(primary);
  }
  if (tabParam && tabs.some((t) => t.slug === tabParam) && isPublicBookTabSlug(tabParam)) {
    return tabParam;
  }
  return primaryPublicBookTabSlug(primary);
}

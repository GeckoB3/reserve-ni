/**
 * UI label translation layer.
 * Returns the correct term (Guest/Client/Patient, Reservation/Appointment, etc.)
 * based on the venue's terminology config.
 */

import type { VenueTerminology } from '@/types/booking-models';
import { DEFAULT_TERMINOLOGY } from '@/types/booking-models';
import type { BookingModel } from '@/types/booking-models';

function pluralise(word: string): string {
  if (word.endsWith('s') || word.endsWith('x') || word.endsWith('sh') || word.endsWith('ch')) {
    return word + 'es';
  }
  if (word.endsWith('y') && !['a', 'e', 'i', 'o', 'u'].includes(word[word.length - 2]!)) {
    return word.slice(0, -1) + 'ies';
  }
  return word + 's';
}

const TRANSLATION_KEYS = [
  'client', 'clients', 'booking', 'bookings',
  'staff_member', 'staff_members', 'no_show', 'covers',
] as const;

export type TermKey = (typeof TRANSLATION_KEYS)[number];

export function t(key: TermKey, terminology: VenueTerminology): string {
  const translations: Record<TermKey, string> = {
    client: terminology.client,
    clients: pluralise(terminology.client),
    booking: terminology.booking,
    bookings: pluralise(terminology.booking),
    staff_member: terminology.staff,
    staff_members: pluralise(terminology.staff),
    no_show: terminology.client === 'Patient' ? 'DNA' : 'No-show',
    covers: terminology.client === 'Guest' ? 'Covers' : pluralise(terminology.client),
  };

  return translations[key] ?? key;
}

export function getTerminology(
  bookingModel: BookingModel,
  venueTerminology?: Partial<VenueTerminology> | null,
): VenueTerminology {
  return {
    ...DEFAULT_TERMINOLOGY[bookingModel],
    ...(venueTerminology ?? {}),
  };
}

import type { VenueEmailData } from '@/lib/emails/types';

/** Venue row fields needed to build {@link VenueEmailData} for transactional email. */
export interface VenueRowForGuestEmail {
  name: string;
  address?: string | null;
  phone?: string | null;
  booking_page_url?: string | null;
  logo_url?: string | null;
  timezone?: string | null;
  reply_to_email?: string | null;
  email?: string | null;
}

function normalisedReplyTo(row: VenueRowForGuestEmail): string | null {
  const raw = row.reply_to_email ?? row.email;
  if (typeof raw !== 'string') return null;
  const t = raw.trim();
  return t ? t : null;
}

/**
 * Maps a DB venue row to template/delivery context. Reply-To uses `reply_to_email`, falling back to legacy `email`.
 */
export function venueRowToEmailData(row: VenueRowForGuestEmail): VenueEmailData {
  return {
    name: row.name,
    address: row.address ?? null,
    phone: row.phone ?? null,
    logo_url: row.logo_url ?? null,
    booking_page_url: row.booking_page_url ?? undefined,
    timezone: row.timezone ?? undefined,
    reply_to_email: normalisedReplyTo(row),
  };
}

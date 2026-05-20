import type { RenderedSms } from '../types';

export interface AppointmentWaitlistOfferSmsInput {
  venueName: string;
  bookingPageUrl: string;
}

/**
 * Waitlist availability SMS — short message with booking link (no slot-hold language).
 */
export function renderAppointmentWaitlistOfferSms(
  input: AppointmentWaitlistOfferSmsInput,
): RenderedSms {
  const url = input.bookingPageUrl.trim();
  const venue = input.venueName.trim();
  return {
    body: `Availability has opened at ${venue} for the appointment you requested. Book online: ${url}`,
  };
}

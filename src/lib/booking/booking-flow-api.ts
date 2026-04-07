/**
 * Centralises public vs staff dashboard URLs for shared booking flows.
 * Read paths that accept `venue_id` stay on /api/booking/* for both audiences where equivalent.
 * Staff-only routes use cookies (venue context) and omit venue_id.
 */

export type BookingFlowAudience = 'public' | 'staff';

export function localTodayISO(): string {
  const n = new Date();
  const y = n.getFullYear();
  const m = String(n.getMonth() + 1).padStart(2, '0');
  const d = String(n.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function appointmentCatalogUrl(venueId: string, practitionerSlug?: string): string {
  const qs = new URLSearchParams({ venue_id: venueId });
  if (practitionerSlug) qs.set('practitioner_slug', practitionerSlug);
  return `/api/booking/appointment-catalog?${qs}`;
}

export function bookingAvailabilityUrl(params: URLSearchParams): string {
  return `/api/booking/availability?${params}`;
}

export function validateAppointmentSlotUrl(): string {
  return '/api/booking/validate-appointment-slot';
}

export function bookingCreateUrl(): string {
  return '/api/booking/create';
}

export function bookingCreateMultiServiceUrl(): string {
  return '/api/booking/create-multi-service';
}

export function bookingCreateGroupUrl(): string {
  return '/api/booking/create-group';
}

export function venueBookingsCreateUrl(): string {
  return '/api/venue/bookings';
}

export function bookingConfirmPaymentUrl(): string {
  return '/api/booking/confirm-payment';
}

export function eventOfferingsUrl(audience: BookingFlowAudience, venueId: string): string {
  const from = localTodayISO();
  if (audience === 'staff') {
    return `/api/venue/event-offerings?from=${from}&days=90`;
  }
  return `/api/booking/event-offerings?venue_id=${encodeURIComponent(venueId)}&from=${from}&days=90`;
}

export function classOfferingsUrl(audience: BookingFlowAudience, venueId: string): string {
  const from = localTodayISO();
  if (audience === 'staff') {
    return `/api/venue/class-offerings?from=${from}&days=90`;
  }
  return `/api/booking/class-offerings?venue_id=${encodeURIComponent(venueId)}&from=${from}&days=90`;
}

export function resourceOptionsUrl(audience: BookingFlowAudience, venueId: string): string {
  if (audience === 'staff') {
    return '/api/venue/resource-options';
  }
  return `/api/booking/resource-options?venue_id=${encodeURIComponent(venueId)}`;
}

/**
 * Calendar month: use duration `any` before the guest picks a concrete duration (public + staff unified).
 */
export function resourceCalendarUrl(
  audience: BookingFlowAudience,
  venueId: string,
  resourceId: string,
  year: number,
  month: number,
  duration: 'any' | number,
): string {
  const params = new URLSearchParams({
    resource_id: resourceId,
    year: String(year),
    month: String(month),
  });
  if (duration === 'any') {
    params.set('duration', 'any');
  } else {
    params.set('duration', String(duration));
  }
  if (audience === 'public') {
    params.set('venue_id', venueId);
  }
  return audience === 'staff'
    ? `/api/venue/resource-calendar?${params}`
    : `/api/booking/resource-calendar?${params}`;
}

/** Time slots for a chosen date + duration. */
export function resourceSlotsUrl(
  audience: BookingFlowAudience,
  venueId: string,
  date: string,
  durationMinutes: number,
  resourceId: string,
): string {
  if (audience === 'staff') {
    return `/api/venue/resource-availability?date=${encodeURIComponent(date)}&duration=${durationMinutes}`;
  }
  const params = new URLSearchParams({
    venue_id: venueId,
    date,
    duration: String(durationMinutes),
    booking_model: 'resource_booking',
    resource_id: resourceId,
  });
  return `/api/booking/availability?${params}`;
}
